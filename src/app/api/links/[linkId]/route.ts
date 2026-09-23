import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { fireWebhooks } from "@/lib/webhooks";
import { ApiError, canWrite, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ linkId: string }> };

/** DELETE /api/links/:id — remove a link (either end sees the removal). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) throw new ApiError("Viewers cannot make changes", 403);
    const { linkId } = await ctx.params;

    const link = await db.issueLink.findUnique({
      where: { id: linkId },
      include: {
        source: { select: { id: true, key: true, orgId: true, projectId: true } },
        target: { select: { id: true, key: true, projectId: true } },
      },
    });
    if (!link || link.orgId !== session.org.id) return notFound("Link not found");

    await db.issueLink.delete({ where: { id: link.id } });

    await Promise.all([
      logActivity({
        orgId: session.org.id,
        userId: session.user.id,
        issueId: link.source.id,
        projectId: link.source.projectId,
        type: "issue.link_removed",
        field: link.type,
        oldValue: link.target.key,
        newValue: null,
      }),
      logActivity({
        orgId: session.org.id,
        userId: session.user.id,
        issueId: link.target.id,
        projectId: link.target.projectId,
        type: "issue.link_removed",
        field: link.type,
        oldValue: link.source.key,
        newValue: null,
      }),
    ]);

    void fireWebhooks("issue.updated", {
      orgId: session.org.id,
      actor: { id: session.user.id, name: session.user.name },
      data: { issueKey: link.source.key, action: "link.removed", linkType: link.type, targetKey: link.target.key },
    });

    return NextResponse.json({ ok: true });
  });
}
