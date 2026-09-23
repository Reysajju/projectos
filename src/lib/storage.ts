/**
 * Object storage adapter (blueprint §15) — S3-style opaque keys.
 *
 * The blueprint mandates "never store files inside the database"; production
 * would bind this to S3/MinIO via presigned URLs. In this sandbox we ship a
 * local-disk adapter with the SAME interface (put/get/delete + keys), so the
 * rest of the app never touches the filesystem directly and can be re-bound
 * to S3 by swapping only this file.
 *
 * Layout:  db/uploads/<orgId>/<storageKey>
 * Keys are generated server-side (cuid + sanitized extension) — the browser
 * never controls the path, which prevents traversal/overwrite attacks.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

const BUCKET_ROOT =
  process.env.STORAGE_DIR ||
  (process.env.VERCEL
    ? path.join("/tmp", "uploads")
    : path.join(process.cwd(), "db", "uploads"));

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — configurable limit (§37)

/** MIME types the portal accepts. Empty extension-safe list, no executables. */
export const ALLOWED_MIME = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/markdown", "text/csv",
  "application/json",
  "application/zip", "application/gzip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

/** Persist bytes under an org-scoped key. Returns the storage key. */
export async function putObject(orgId: string, key: string, data: Buffer): Promise<void> {
  const dir = path.join(BUCKET_ROOT, orgId);
  const abs = path.join(dir, key);
  assertInsideBucket(abs);
  await mkdir(dir, { recursive: true });
  await writeFile(abs, data);
}

/** Read bytes back. Throws StorageError(404) when the object is missing. */
export async function getObject(orgId: string, key: string): Promise<Buffer> {
  const abs = path.join(BUCKET_ROOT, orgId, key);
  assertInsideBucket(abs);
  try {
    return await readFile(abs);
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
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
