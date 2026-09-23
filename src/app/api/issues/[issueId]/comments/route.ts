import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity, notify, notifyMentions } from "@/lib/workflow";
import { runAutomations } from "@/lib/automation";
import { fireWebhooks } from "@/lib/webhooks";
import { toCommentDTO } from "@/lib/dto";
import { canWrite, clip, forbidden, handle, notFound, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ issueId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { issueId } = await ctx.params;
    const body = await parseBody(req);
    const orgId = session.org.id;

    const issue = await db.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.orgId !== orgId) return notFound("Issue not found");

    const text = reqStr(body, "body");

    const comment = await db.comment.create({
      data: { issueId: issue.id, authorId: session.user.id, body: text },
      include: { author: true },
    });

    await logActivity({
      orgId,
      userId: session.user.id,
      issueId: issue.id,
      projectId: issue.projectId,
      type: "comment.created",
      newValue: clip(text, 120),
    });

    // Notify assignee + reporter (never the actor).
    const targets = new Set<string>();
    if (issue.assigneeId) targets.add(issue.assigneeId);
    if (issue.reporterId) targets.add(issue.reporterId);
    targets.delete(session.user.id);
    for (const userId of targets) {
      await notify({
        orgId,
        userId,
        type: "comment",
        title: `New comment on ${issue.key}`,
        body: `${session.user.name}: ${clip(text, 120)}`,
        issueId: issue.id,
      });
    }

    // @mentions — parsed from the body, matched against org members.
    const members = await db.organizationMember.findMany({
      where: { orgId },
      include: { user: { select: { name: true } } },
    });
    await notifyMentions({
      orgId,
      issueId: issue.id,
      issueKey: issue.key,
      body: text,
      actor: session.user,
      members: members
        .filter((m) => m.userId !== session.user.id)
        .map((m) => ({ userId: m.userId, user: { name: m.user.name } })),
    });

    void runAutomations("comment.created", {
      orgId,
      issueId: issue.id,
      actor: { id: session.user.id, name: session.user.name },
      commentBody: text,
    });

    void fireWebhooks("comment.created", {
      orgId,
      actor: { id: session.user.id, name: session.user.name },
      data: { issueKey: issue.key, commentId: comment.id, body: text.slice(0, 500) },
    });

    return NextResponse.json(toCommentDTO(comment));
  });
}
