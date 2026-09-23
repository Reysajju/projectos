import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity, notify } from "@/lib/workflow";
import { fireWebhooks } from "@/lib/webhooks";
import { toLinkedIssueDTO } from "@/lib/dto";
import { ApiError, canWrite, handle, notFound, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";
import type { IssueLinkType } from "@/lib/portal-types";

export const dynamic = "force-dynamic";

export const LINK_TYPES: IssueLinkType[] = ["BLOCKS", "DUPLICATES", "RELATES", "CAUSES"];

type Ctx = { params: Promise<{ issueId: string }> };

/** POST /api/issues/:id/links — create a directed link {type, targetKey}. */
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) throw new ApiError("Viewers cannot make changes", 403);
    const { issueId } = await ctx.params;
    const body = await parseBody(req);

    const type = reqStr(body, "type").toUpperCase() as IssueLinkType;
    if (!LINK_TYPES.includes(type)) {
      throw new ApiError(`type must be one of ${LINK_TYPES.join(", ")}`, 400);
    }
    const targetKey = reqStr(body, "targetKey").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(targetKey)) {
      throw new ApiError("targetKey must look like WEB-9", 400);
    }

    const [source, target] = await Promise.all([
      db.issue.findUnique({ where: { id: issueId }, select: { id: true, orgId: true, key: true, summary: true, assigneeId: true, projectId: true } }),
      db.issue.findFirst({
        where: { orgId: session.org.id, key: { equals: targetKey } },
        select: { id: true, key: true, summary: true, assigneeId: true, projectId: true },
      }),
    ]);
    if (!source || source.orgId !== session.org.id) return notFound("Issue not found");
    if (!target) throw new ApiError(`Issue ${targetKey} not found in this workspace`, 404);
    if (target.id === source.id) throw new ApiError("An issue cannot link to itself", 400);

    // Duplicate guard: same pair+type in either direction reads as the same
    // relationship to users (A blocks B ⟺ B is blocked by A).
    const dup = await db.issueLink.findFirst({
      where: {
        orgId: session.org.id,
        type,
        OR: [
          { sourceId: source.id, targetId: target.id },
          { sourceId: target.id, targetId: source.id },
        ],
      },
    });
    if (dup) {
      throw new ApiError(`${source.key} already has a ${type.toLowerCase()} link with ${target.key}`, 409);
    }

    const link = await db.issueLink.create({
      data: {
        orgId: session.org.id,
        type,
        sourceId: source.id,
        targetId: target.id,
        createdById: session.user.id,
      },
      include: {
        source: { include: { type: true, status: true, priority: true } },
        target: { include: { type: true, status: true, priority: true } },
        createdBy: true,
      },
    });

    const verb = type === "BLOCKS" ? "blocks" : type === "DUPLICATES" ? "duplicates" : type === "CAUSES" ? "causes" : "relates to";
    await Promise.all([
      logActivity({
        orgId: session.org.id,
        userId: session.user.id,
        issueId: source.id,
        projectId: source.projectId,
        type: "issue.linked",
        field: type,
        oldValue: null,
        newValue: `${verb} ${target.key}`,
      }),
      logActivity({
        orgId: session.org.id,
        userId: session.user.id,
        issueId: target.id,
        projectId: target.projectId,
        type: "issue.linked",
        field: type,
        oldValue: null,
        newValue: `${source.key} ${verb} this`,
      }),
      // Notify the target's assignee so blockers surface immediately.
      target.assigneeId && target.assigneeId !== session.user.id
        ? notify({
            orgId: session.org.id,
            userId: target.assigneeId,
            type: "link",
            title: `${source.key} ${verb} ${target.key}`,
            body: `${source.summary}`,
            issueId: target.id,
          })
        : Promise.resolve(),
    ]);

    void fireWebhooks("issue.updated", {
      orgId: session.org.id,
      actor: { id: session.user.id, name: session.user.name },
      data: { issueKey: source.key, action: "link.added", linkType: type, targetKey: target.key },
    });

    return NextResponse.json(toLinkedIssueDTO(link, source.id), { status: 201 });
  });
}
