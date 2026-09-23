import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity, notify, transitionIssue } from "@/lib/workflow";
import { issueInclude, toActivityDTO, toCommentDTO, toIssueDTO } from "@/lib/dto";
import {
  ApiError,
  canWrite,
  clip,
  forbidden,
  handle,
  idOrNull,
  notFound,
  optDateOrNull,
  optNumOrNull,
  optStr,
  optStrArr,
  parseBody,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ issueId: string }> };

type FieldLog = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { issueId } = await ctx.params;

    const issue = await db.issue.findUnique({ where: { id: issueId }, include: issueInclude });
    if (!issue || issue.orgId !== session.org.id) return notFound("Issue not found");

    const [comments, activity, subtasks] = await Promise.all([
      db.comment.findMany({
        where: { issueId },
        include: { author: true },
        orderBy: { createdAt: "asc" },
      }),
      db.activity.findMany({
        where: { issueId },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.issue.findMany({
        where: { parentId: issue.id },
        include: issueInclude,
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return NextResponse.json({
      issue: toIssueDTO(issue),
      comments: comments.map(toCommentDTO),
      activity: activity.map(toActivityDTO),
      subtasks: subtasks.map(toIssueDTO),
    });
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { issueId } = await ctx.params;
    const body = await parseBody(req);
    const orgId = session.org.id;
    const actor = session.user;

    const current = await db.issue.findUnique({
      where: { id: issueId },
      include: {
        type: true,
        status: true,
        priority: true,
        sprint: true,
        assignee: true,
        labels: { include: { label: true } },
      },
    });
    if (!current || current.orgId !== orgId) return notFound("Issue not found");

    const data: Prisma.IssueUncheckedUpdateInput = {};
    const fieldLogs: FieldLog[] = [];
    let assignment: { oldName: string | null; newId: string | null; newName: string | null } | null =
      null;

    // ── Status: MUST go through the workflow engine (its own activity + notify) ──
    const statusRaw = idOrNull(body, "statusId");
    if (statusRaw === null) throw new ApiError("statusId cannot be empty", 400);
    if (statusRaw !== undefined && statusRaw !== current.statusId) {
      await transitionIssue({ issueId: current.id, newStatusId: statusRaw, actor });
    }

    // ── Type ──
    if ("typeId" in body) {
      const v = idOrNull(body, "typeId");
      if (v === null) throw new ApiError("typeId cannot be empty", 400);
      if (v !== undefined && v !== current.typeId) {
        const type = await db.issueType.findFirst({ where: { id: v, orgId } });
        if (!type) throw new ApiError("Invalid issue type", 400);
        data.typeId = type.id;
        fieldLogs.push({ field: "type", oldValue: current.type.name, newValue: type.name });
      }
    }

    // ── Priority ──
    if ("priorityId" in body) {
      const v = idOrNull(body, "priorityId");
      if ((v ?? null) !== current.priorityId) {
        if (v) {
          const priority = await db.priority.findFirst({ where: { id: v, orgId } });
          if (!priority) throw new ApiError("Invalid priority", 400);
          data.priorityId = priority.id;
          fieldLogs.push({
            field: "priority",
            oldValue: current.priority?.name ?? null,
            newValue: priority.name,
          });
        } else {
          data.priorityId = null;
          fieldLogs.push({
            field: "priority",
            oldValue: current.priority?.name ?? null,
            newValue: null,
          });
        }
      }
    }

    // ── Assignee ──
    if ("assigneeId" in body) {
      const v = idOrNull(body, "assigneeId");
      if ((v ?? null) !== current.assigneeId) {
        if (v) {
          const member = await db.organizationMember.findFirst({ where: { orgId, userId: v } });
          if (!member) throw new ApiError("Assignee is not a workspace member", 400);
        }
        data.assigneeId = v ?? null;
        const newAssignee = v ? await db.user.findUnique({ where: { id: v } }) : null;
        assignment = {
          oldName: current.assignee?.name ?? null,
          newId: v ?? null,
          newName: newAssignee?.name ?? null,
        };
      }
    }

    // ── Sprint (null unassigns → backlog) ──
    if ("sprintId" in body) {
      const v = idOrNull(body, "sprintId");
      if ((v ?? null) !== current.sprintId) {
        if (v) {
          const sprint = await db.sprint.findUnique({ where: { id: v } });
          if (!sprint || sprint.projectId !== current.projectId) {
            throw new ApiError("Invalid sprint", 400);
          }
          data.sprintId = sprint.id;
          fieldLogs.push({
            field: "sprint",
            oldValue: current.sprint?.name ?? "Backlog",
            newValue: sprint.name,
          });
        } else {
          data.sprintId = null;
          fieldLogs.push({
            field: "sprint",
            oldValue: current.sprint?.name ?? "Backlog",
            newValue: "Backlog",
          });
        }
      }
    }

    // ── Scalars ──
    if ("summary" in body) {
      const v = optStr(body, "summary");
      if (v !== undefined && v.trim() && v.trim() !== current.summary) {
        data.summary = v.trim();
        fieldLogs.push({
          field: "summary",
          oldValue: clip(current.summary),
          newValue: clip(v.trim()),
        });
      }
    }
    if ("description" in body) {
      const raw: unknown = body.description;
      const desc =
        raw === null || raw === undefined ? null : typeof raw === "string" ? raw : undefined;
      if (desc === undefined) throw new ApiError("Invalid description", 400);
      if (desc !== current.description) {
        data.description = desc;
        fieldLogs.push({
          field: "description",
          oldValue: clip(current.description),
          newValue: clip(desc),
        });
      }
    }
    if ("storyPoints" in body) {
      const v = optNumOrNull(body, "storyPoints");
      const sp = v == null ? null : Math.max(0, Math.round(v));
      if (sp !== current.storyPoints) {
        data.storyPoints = sp;
        fieldLogs.push({
          field: "storyPoints",
          oldValue: current.storyPoints != null ? String(current.storyPoints) : null,
          newValue: sp != null ? String(sp) : null,
        });
      }
    }
    if ("dueDate" in body) {
      const d = optDateOrNull(body, "dueDate");
      if ((d?.getTime() ?? null) !== (current.dueDate?.getTime() ?? null)) {
        data.dueDate = d;
        fieldLogs.push({
          field: "dueDate",
          oldValue: current.dueDate ? current.dueDate.toISOString() : null,
          newValue: d ? d.toISOString() : null,
        });
      }
    }
    if ("estimateHours" in body) {
      const v = optNumOrNull(body, "estimateHours");
      const val = v == null ? null : Math.max(0, v);
      if (val !== current.estimateHours) {
        data.estimateHours = val;
        fieldLogs.push({
          field: "estimateHours",
          oldValue: current.estimateHours != null ? String(current.estimateHours) : null,
          newValue: val != null ? String(val) : null,
        });
      }
    }
    if ("remainingHours" in body) {
      const v = optNumOrNull(body, "remainingHours");
      const val = v == null ? null : Math.max(0, v);
      if (val !== current.remainingHours) {
        data.remainingHours = val;
        fieldLogs.push({
          field: "remainingHours",
          oldValue: current.remainingHours != null ? String(current.remainingHours) : null,
          newValue: val != null ? String(val) : null,
        });
      }
    }
    if ("order" in body) {
      const v = body.order;
      if (typeof v !== "number" || !Number.isFinite(v)) throw new ApiError("Invalid order", 400);
      if (v !== current.order) {
        data.order = v;
        fieldLogs.push({ field: "order", oldValue: String(current.order), newValue: String(v) });
      }
    }

    // ── Labels: replace the whole set ──
    if ("labelIds" in body) {
      const ids = optStrArr(body, "labelIds");
      if (ids === undefined) throw new ApiError("Invalid labelIds", 400);
      const nextLabels = ids.length
        ? await db.label.findMany({ where: { id: { in: ids }, orgId } })
        : [];
      const oldNames = current.labels
        .map((il) => il.label.name)
        .sort()
        .join(", ");
      const newNames = nextLabels
        .map((l) => l.name)
        .sort()
        .join(", ");
      if (oldNames !== newNames) {
        await db.$transaction([
          db.issueLabel.deleteMany({ where: { issueId: current.id } }),
          db.issueLabel.createMany({
            data: nextLabels.map((l) => ({ issueId: current.id, labelId: l.id })),
          }),
        ]);
        fieldLogs.push({ field: "labels", oldValue: oldNames || null, newValue: newNames || null });
      }
    }

    // ── Apply non-status field changes ──
    if (Object.keys(data).length > 0) {
      await db.issue.update({ where: { id: current.id }, data });
    }

    // ── Audit trail: one issue.updated row per changed field ──
    for (const log of fieldLogs) {
      await logActivity({
        orgId,
        userId: actor.id,
        issueId: current.id,
        projectId: current.projectId,
        type: "issue.updated",
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
      });
    }

    // ── Assignment change → issue.assigned activity + notify assignee ──
    if (assignment) {
      await logActivity({
        orgId,
        userId: actor.id,
        issueId: current.id,
        projectId: current.projectId,
        type: "issue.assigned",
        field: "assignee",
        oldValue: assignment.oldName,
        newValue: assignment.newName,
      });
      if (assignment.newId && assignment.newId !== actor.id) {
        await notify({
          orgId,
          userId: assignment.newId,
          type: "assigned",
          title: `${current.key} assigned to you`,
          body: `${actor.name} assigned you: ${current.summary}`,
          issueId: current.id,
        });
      }
    }

    const updated = await db.issue.findUnique({ where: { id: current.id }, include: issueInclude });
    if (!updated) return notFound("Issue not found");
    return NextResponse.json(toIssueDTO(updated));
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { issueId } = await ctx.params;

    const issue = await db.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.orgId !== session.org.id) return notFound("Issue not found");

    await db.issue.delete({ where: { id: issue.id } });
    return NextResponse.json({});
  });
}
