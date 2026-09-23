import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity, notify, transitionIssue } from "@/lib/workflow";
import { runAutomations } from "@/lib/automation";
import { fireWebhooks } from "@/lib/webhooks";
import { issueInclude, parseJsonRecord, toActivityDTO, toAttachmentDTO, toCommentDTO, toIssueDTO } from "@/lib/dto";
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

function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

function summarizeCustomFields(map: Record<string, string>, defs: { id: string; name: string }[]): string | null {
  const parts = Object.entries(map)
    .map(([id, v]) => `${defs.find((d) => d.id === id)?.name ?? id}: ${v}`)
    .sort();
  return parts.length ? parts.join(", ") : null;
}

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

    const [comments, activity, subtasks, attachments] = await Promise.all([
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
      db.attachment.findMany({
        where: { issueId },
        include: { uploadedBy: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      issue: toIssueDTO(issue),
      comments: comments.map(toCommentDTO),
      activity: activity.map(toActivityDTO),
      subtasks: subtasks.map(toIssueDTO),
      attachments: attachments.map(toAttachmentDTO),
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

    // ── dueDate start-window guard: startDate must stay ≤ dueDate when due moves ──
    if ("dueDate" in body && current.startDate) {
      const d = optDateOrNull(body, "dueDate");
      if (d && d < current.startDate) {
        throw new ApiError("Due date must be after the start date", 400);
      }
    }

    const data: Prisma.IssueUncheckedUpdateInput = {};
    const fieldLogs: FieldLog[] = [];
    let assignment: { oldName: string | null; newId: string | null; newName: string | null } | null =
      null;

    // ── Status: MUST go through the workflow engine (its own activity + notify) ──
    const statusRaw = idOrNull(body, "statusId");
    if (statusRaw === null) throw new ApiError("statusId cannot be empty", 400);
    let statusChanged = false;
    if (statusRaw !== undefined && statusRaw !== current.statusId) {
      await transitionIssue({ issueId: current.id, newStatusId: statusRaw, actor });
      statusChanged = true;
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
    if ("startDate" in body) {
      const d = optDateOrNull(body, "startDate");
      if ((d?.getTime() ?? null) !== (current.startDate?.getTime() ?? null)) {
        // Roadmap sanity: start may not sit after dueDate.
        const due = d && current.dueDate && d > current.dueDate ? current.dueDate : null;
        if (due) throw new ApiError("Start date must be before the due date", 400);
        data.startDate = d;
        fieldLogs.push({
          field: "startDate",
          oldValue: current.startDate ? current.startDate.toISOString() : null,
          newValue: d ? d.toISOString() : null,
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

    // ── Custom fields: replace values map (validated against org field defs) ──
    if ("customFields" in body) {
      const raw: unknown = body.customFields;
      if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
        throw new ApiError("Invalid customFields payload", 400);
      }
      const incoming = (raw ?? {}) as Record<string, unknown>;
      const defs = await db.customField.findMany({ where: { orgId } });
      const defById = new Map(defs.map((d) => [d.id, d]));
      const next: Record<string, string> = {};
      for (const [fieldId, value] of Object.entries(incoming)) {
        const def = defById.get(fieldId);
        if (!def) throw new ApiError(`Unknown custom field: ${fieldId}`, 400);
        if (value === null || value === undefined || value === "") continue; // cleared values dropped
        const v = typeof value === "string" ? value : String(value);
        if (def.type === "NUMBER" && !Number.isFinite(Number(v))) {
          throw new ApiError(`Custom field “${def.name}” expects a number`, 400);
        }
        if (def.type === "DATE" && Number.isNaN(Date.parse(v))) {
          throw new ApiError(`Custom field “${def.name}” expects a date`, 400);
        }
        if (def.type === "SELECT" && !parseOptions(def.options).includes(v)) {
          throw new ApiError(`Invalid option for custom field “${def.name}”`, 400);
        }
        if (def.type === "CHECKBOX") {
          next[fieldId] = v === "true" ? "true" : "false";
        } else {
          next[fieldId] = v.slice(0, 500);
        }
      }
      const currentMap = parseJsonRecord(current.customFields);
      if (JSON.stringify(currentMap) !== JSON.stringify(next)) {
        data.customFields = Object.keys(next).length ? JSON.stringify(next) : null;
        const oldDesc = summarizeCustomFields(currentMap, defs);
        const newDesc = summarizeCustomFields(next, defs);
        if (oldDesc !== newDesc) {
          fieldLogs.push({ field: "customFields", oldValue: oldDesc, newValue: newDesc });
        }
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

    if (statusChanged) {
      void runAutomations("issue.status_changed", {
        orgId,
        issueId: current.id,
        actor: { id: actor.id, name: actor.name },
      });
      void fireWebhooks("issue.status_changed", {
        orgId,
        actor: { id: actor.id, name: actor.name },
        data: {
          key: updated.key,
          summary: updated.summary,
          from: current.status.name,
          to: updated.status.name,
        },
      });
    }
    if (assignment) {
      void runAutomations("issue.assigned", {
        orgId,
        issueId: current.id,
        actor: { id: actor.id, name: actor.name },
      });
    }
    if (Object.keys(data).length > 0 || statusChanged) {
      void fireWebhooks("issue.updated", {
        orgId,
        actor: { id: actor.id, name: actor.name },
        data: {
          key: updated.key,
          summary: updated.summary,
          status: updated.status.name,
          changedFields: fieldLogs.map((l) => l.field),
        },
      });
    }

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
    void fireWebhooks("issue.deleted", {
      orgId: issue.orgId,
      actor: { id: session.user.id, name: session.user.name },
      data: { key: issue.key, summary: issue.summary },
    });
    return NextResponse.json({});
  });
}
