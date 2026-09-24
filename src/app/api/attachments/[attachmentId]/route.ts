import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";
import { forbidden, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ attachmentId: string }> };

/**
 * GET — stream the object. Inline by default (used for image thumbnails in
 * the issue panel); `?download=1` forces a browser download with the original
 * filename via Content-Disposition.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await ctx.params;
  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.orgId !== session.org.id) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  try {
    const { getObjectStream } = await import("@/lib/storage");
    const { Readable } = await import("node:stream");
    const forceDownload = req.nextUrl.searchParams.get("download") === "1";
    const disposition = forceDownload ? "attachment" : "inline";

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const { size } = await getObjectStream(attachment.orgId, attachment.storageKey);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
      const chunkSize = end - start + 1;

      const { stream } = await getObjectStream(attachment.orgId, attachment.storageKey, { start, end });
      const webStream = Readable.toWeb(stream as any);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": attachment.mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.originalName)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const { stream, size } = await getObjectStream(attachment.orgId, attachment.storageKey);
    const webStream = Readable.toWeb(stream as any);

    return new Response(webStream as any, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.originalName)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Object missing from storage" }, { status: 404 });
  }
}

/** DELETE — uploader or org admins only. Removes the DB row + the object. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role === "VIEWER") return forbidden("Viewers cannot delete attachments");
    const { attachmentId } = await ctx.params;

    const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.orgId !== session.org.id) {
      return notFound("Attachment not found");
    }
    if (attachment.uploadedById !== session.user.id && !["ADMIN", "MANAGER"].includes(session.role)) {
      return forbidden("Only the uploader or admins can delete this attachment");
    }

    await db.attachment.delete({ where: { id: attachment.id } });
    await deleteObject(attachment.orgId, attachment.storageKey);

    return NextResponse.json({});
  });
}
