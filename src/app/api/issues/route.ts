import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity, notify } from "@/lib/workflow";
import { issueInclude, toIssueDTO } from "@/lib/dto";
import {
  ApiError,
  canWrite,
  forbidden,
  handle,
  idOrNull,
  notFound,
  optDateOrNull,
  optNumOrNull,
  optStrArr,
  optStrOrNull,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const body = await parseBody(req);
    const orgId = session.org.id;

    // ── Validate + resolve references (all org-scoped) ──
    const projectId = reqStr(body, "projectId");
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project || project.orgId !== orgId) return notFound("Project not found");

    const typeId = reqStr(body, "typeId");
    const type = await db.issueType.findFirst({ where: { id: typeId, orgId } });
    if (!type) throw new ApiError("Invalid issue type", 400);

    const summary = reqStr(body, "summary");
    const description = optStrOrNull(body, "description") ?? null;

    let priorityId: string | null = null;
    const priorityRaw = idOrNull(body, "priorityId");
    if (priorityRaw) {
      const priority = await db.priority.findFirst({ where: { id: priorityRaw, orgId } });
      if (!priority) throw new ApiError("Invalid priority", 400);
      priorityId = priority.id;
    }

    let assigneeId: string | null = null;
    const assigneeRaw = idOrNull(body, "assigneeId");
    if (assigneeRaw) {
      const member = await db.organizationMember.findFirst({ where: { orgId, userId: assigneeRaw } });
      if (!member) throw new ApiError("Assignee is not a workspace member", 400);
      assigneeId = assigneeRaw;
    }

    let sprintId: string | null = null;
    const sprintRaw = idOrNull(body, "sprintId");
    if (sprintRaw) {
      const sprint = await db.sprint.findUnique({ where: { id: sprintRaw } });
      if (!sprint || sprint.projectId !== project.id) throw new ApiError("Invalid sprint", 400);
      sprintId = sprint.id;
    }

    let parentId: string | null = null;
    const parentRaw = idOrNull(body, "parentId");
    if (parentRaw) {
      const parent = await db.issue.findUnique({ where: { id: parentRaw } });
      if (!parent || parent.projectId !== project.id) {
        throw new ApiError("Parent issue must be in the same project", 400);
      }
      parentId = parent.id;
    }

    const labelIds = optStrArr(body, "labelIds") ?? [];
    const labels = labelIds.length
      ? await db.label.findMany({ where: { id: { in: labelIds }, orgId } })
      : [];

    const storyRaw = optNumOrNull(body, "storyPoints");
    const storyPoints = storyRaw == null ? null : Math.max(0, Math.round(storyRaw));
    const dueDate = optDateOrNull(body, "dueDate") ?? null;

    const defaultStatus = await db.status.findFirst({ where: { orgId }, orderBy: { order: "asc" } });
    if (!defaultStatus) throw new ApiError("Workspace has no statuses configured", 400);

    // ── Create: number = max per project + 1, computed inside a transaction ──
    const created = await db.$transaction(async (tx) => {
      const agg = await tx.issue.aggregate({
        where: { projectId: project.id },
        _max: { number: true },
      });
      const number = (agg._max.number ?? 0) + 1;
      return tx.issue.create({
        data: {
          orgId,
          projectId: project.id,
          number,
          key: `${project.key}-${number}`,
          typeId: type.id,
          statusId: defaultStatus.id,
          priorityId,
          summary,
          description,
          reporterId: session.user.id,
          assigneeId,
          parentId,
          sprintId,
          storyPoints,
          dueDate,
          labels: { create: labels.map((l) => ({ labelId: l.id })) },
        },
        include: issueInclude,
      });
    });

    await logActivity({
      orgId,
      userId: session.user.id,
      issueId: created.id,
      projectId: project.id,
      type: "issue.created",
      newValue: created.summary,
    });

    if (assigneeId && assigneeId !== session.user.id) {
      await notify({
        orgId,
        userId: assigneeId,
        type: "assigned",
        title: `${created.key} assigned to you`,
        body: `${session.user.name} assigned you: ${summary}`,
        issueId: created.id,
      });
    }

    return NextResponse.json(toIssueDTO(created));
  });
}
