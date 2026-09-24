/**
 * Object storage adapter (blueprint §15) — S3-style opaque keys.
 *
 * Supports single-part and chunked uploads up to GB scale (configurable MAX_FILE_BYTES),
 * streaming downloads (zero RAM spikes), and Range requests.
 *
 * Layout:  db/uploads/<orgId>/<storageKey>
 * Keys are generated server-side (cuid + sanitized extension) — the browser
 * never controls the path, which prevents traversal/overwrite attacks.
 */
import { mkdir, readFile, unlink, writeFile, stat, rename, copyFile, appendFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

const BUCKET_ROOT =
  process.env.STORAGE_DIR ||
  (process.env.VERCEL
    ? path.join("/tmp", "uploads")
    : path.join(process.cwd(), "db", "uploads"));

// Default 5 GB limit (customizable via MAX_FILE_BYTES environment variable)
export const MAX_FILE_BYTES =
  Number(process.env.MAX_FILE_BYTES) || 5 * 1024 * 1024 * 1024;

/** Common MIME types accepted in the portal. All safe types accepted. */
export const ALLOWED_MIME = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
  "application/pdf",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/xml",
  "application/zip", "application/gzip", "application/x-tar", "application/x-7z-compressed", "application/x-rar-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4", "video/webm", "video/quicktime", "video/x-matroska",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/aac",
  "application/octet-stream",
];

export class StorageError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function assertInsideBucket(abs: string) {
  const rel = path.relative(BUCKET_ROOT, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StorageError("Invalid storage key", 400);
  }
}

/** Sanitize a client-supplied filename for display-safe + key-safe use. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return (cleaned || "file").slice(0, 180);
}

/** Generate an opaque, collision-safe storage key (cuid-like). */
export function makeStorageKey(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
  const rand = randomBytes(9).toString("hex");
  const stamp = Date.now().toString(36);
  return `${stamp}-${rand}${ext}`;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Persist small object buffer under an org-scoped key. */
export async function putObject(orgId: string, key: string, data: Buffer): Promise<void> {
  const dir = path.join(BUCKET_ROOT, orgId);
  const abs = path.join(dir, key);
  assertInsideBucket(abs);
  await mkdir(dir, { recursive: true });
  await writeFile(abs, data);
}

/** Read bytes back in memory (for smaller files). */
export async function getObject(orgId: string, key: string): Promise<Buffer> {
  const abs = path.join(BUCKET_ROOT, orgId, key);
  assertInsideBucket(abs);
  try {
    return await readFile(abs);
  } catch {
    throw new StorageError("Object missing from storage", 404);
  }
}

/** Append an upload chunk to a temporary file on disk. */
export async function appendChunk(uploadId: string, chunkBuffer: Buffer): Promise<void> {
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new StorageError("Invalid upload ID", 400);

  const tempDir = path.join(BUCKET_ROOT, "temp");
  const tempPath = path.join(tempDir, `${safeId}.part`);
  assertInsideBucket(tempPath);

  await mkdir(tempDir, { recursive: true });
  await appendFile(tempPath, chunkBuffer);
}

/** Finalize chunked upload: computes sha256 checksum and moves to destination. */
export async function finalizeUpload(
  uploadId: string,
  orgId: string,
  storageKey: string
): Promise<{ checksum: string; size: number }> {
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  const tempDir = path.join(BUCKET_ROOT, "temp");
  const tempPath = path.join(tempDir, `${safeId}.part`);
  assertInsideBucket(tempPath);

  const targetDir = path.join(BUCKET_ROOT, orgId);
  const targetPath = path.join(targetDir, storageKey);
  assertInsideBucket(targetPath);

  await mkdir(targetDir, { recursive: true });

  // Stream hash calculation and byte counting without memory spikes
  const hash = createHash("sha256");
  let totalBytes = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(tempPath);
    stream.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      hash.update(chunk);
    });
    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  const checksum = hash.digest("hex");

  try {
    await rename(tempPath, targetPath);
  } catch {
    // Fallback if cross-device boundary
    await copyFile(tempPath, targetPath);
    await unlink(tempPath).catch(() => {});
  }

  return { checksum, size: totalBytes };
}

/** Clean up incomplete or failed chunked upload temp file. */
export async function cleanTempUpload(uploadId: string): Promise<void> {
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return;
  const tempPath = path.join(BUCKET_ROOT, "temp", `${safeId}.part`);
  try {
    await unlink(tempPath);
  } catch {
    // already removed
  }
}

/** Open a stream for reading without loading into Node.js buffer memory. */
export async function getObjectStream(
  orgId: string,
  key: string,
  range?: { start: number; end: number }
): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
  const abs = path.join(BUCKET_ROOT, orgId, key);
  assertInsideBucket(abs);
  try {
    const st = await stat(abs);
    const stream = range
      ? createReadStream(abs, { start: range.start, end: range.end })
      : createReadStream(abs);
    return { stream, size: st.size };
  } catch {
    throw new StorageError("Object missing from storage", 404);
  }
}

/** Best-effort delete — storage orphans must never break request paths. */
export async function deleteObject(orgId: string, key: string): Promise<void> {
  const abs = path.join(BUCKET_ROOT, orgId, key);
  assertInsideBucket(abs);
  try {
    await unlink(abs);
  } catch {
    // already gone — fine
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
