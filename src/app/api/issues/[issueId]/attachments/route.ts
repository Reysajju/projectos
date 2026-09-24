import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { fireWebhooks } from "@/lib/webhooks";
import { toAttachmentDTO } from "@/lib/dto";
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  appendChunk,
  cleanTempUpload,
  finalizeUpload,
  formatBytes,
  makeStorageKey,
  putObject,
  sanitizeFileName,
  sha256,
} from "@/lib/storage";
import { forbidden, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ issueId: string }> };

/**
 * POST multipart/form-data:
 * - Single-part: { file }
 * - Chunked: { chunk, uploadId, chunkIndex, totalChunks, fileName, fileSize, mimeType }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role === "VIEWER") return forbidden("Viewers cannot upload attachments");
    const { issueId } = await ctx.params;
    const orgId = session.org.id;

    const issue = await db.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.orgId !== orgId) return notFound("Issue not found");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const uploadId = form.get("uploadId");
    const chunkIndexStr = form.get("chunkIndex");
    const totalChunksStr = form.get("totalChunks");

    // ─── Chunked Upload Pathway (bypasses Vercel 4.5MB limit, supports GBs) ───
    if (uploadId && typeof uploadId === "string" && chunkIndexStr !== null && totalChunksStr !== null) {
      const chunk = form.get("chunk");
      if (!(chunk instanceof Blob)) {
        return NextResponse.json({ error: "chunk blob is required" }, { status: 400 });
      }

      const chunkIndex = parseInt(String(chunkIndexStr), 10);
      const totalChunks = parseInt(String(totalChunksStr), 10);
      const fileNameRaw = String(form.get("fileName") || "file");
      const fileSize = Number(form.get("fileSize") || 0);
      const mime = String(form.get("mimeType") || chunk.type || "application/octet-stream");

      if (fileSize > MAX_FILE_BYTES) {
        await cleanTempUpload(uploadId);
        return NextResponse.json(
          { error: `File exceeds the ${formatBytes(MAX_FILE_BYTES)} limit` },
          { status: 413 }
        );
      }

      const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
      await appendChunk(uploadId, chunkBuffer);

      // Non-final chunk: acknowledge receipt
      if (chunkIndex < totalChunks - 1) {
        return NextResponse.json({ ok: true, chunkIndex, totalChunks });
      }

      // Final chunk arrived: assemble, compute sha256 checksum and move into place
      const originalName = sanitizeFileName(fileNameRaw);
      const storageKey = makeStorageKey(originalName);
      const { checksum, size } = await finalizeUpload(uploadId, orgId, storageKey);

      const attachment = await db.attachment.create({
        data: {
          orgId,
          issueId: issue.id,
          uploadedById: session.user.id,
          originalName,
          storageKey,
          mimeType: mime,
          size,
          checksum,
        },
        include: { uploadedBy: true },
      });

      await logActivity({
        orgId,
        userId: session.user.id,
        issueId: issue.id,
        projectId: issue.projectId,
        type: "issue.updated",
        field: "attachment",
        newValue: originalName,
      });

      void fireWebhooks("issue.updated", {
        orgId,
        actor: { id: session.user.id, name: session.user.name },
        data: { action: "attachment.added", issueKey: issue.key, attachment: originalName },
      });

      return NextResponse.json({ attachment: toAttachmentDTO(attachment) }, { status: 201 });
    }

    // ─── Single Direct File Upload Pathway ───
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty files cannot be attached" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${formatBytes(MAX_FILE_BYTES)} limit` },
        { status: 413 }
      );
    }
    const mime = file.type || "application/octet-stream";

    const originalName = sanitizeFileName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = makeStorageKey(originalName);
    await putObject(orgId, storageKey, buffer);

    const attachment = await db.attachment.create({
      data: {
        orgId,
        issueId: issue.id,
        uploadedById: session.user.id,
        originalName,
        storageKey,
        mimeType: mime,
        size: file.size,
        checksum: sha256(buffer),
      },
      include: { uploadedBy: true },
    });

    await logActivity({
      orgId,
      userId: session.user.id,
      issueId: issue.id,
      projectId: issue.projectId,
      type: "issue.updated",
      field: "attachment",
      newValue: originalName,
    });

    void fireWebhooks("issue.updated", {
      orgId,
      actor: { id: session.user.id, name: session.user.name },
      data: { action: "attachment.added", issueKey: issue.key, attachment: originalName },
    });

    return NextResponse.json({ attachment: toAttachmentDTO(attachment) }, { status: 201 });
  });
}

/** GET — list the issue's attachments. */
export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { issueId } = await ctx.params;

    const issue = await db.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.orgId !== session.org.id) return notFound("Issue not found");

    const attachments = await db.attachment.findMany({
      where: { issueId: issue.id },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ attachments: attachments.map(toAttachmentDTO) });
  });
}
