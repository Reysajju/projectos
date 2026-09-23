import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueInclude, toActivityDTO, toIssueDTO, toProjectDTO, toSprintDTO } from "@/lib/dto";
import {
  ApiError,
  canWrite,
  forbidden,
  handle,
  idOrNull,
  notFound,
  optBool,
  optStr,
  parseBody,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

async function getOwnedProject(orgId: string, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { lead: true, _count: { select: { issues: true } } },
  });
  if (!project || project.orgId !== orgId) return null;
  return project;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { projectId } = await ctx.params;

    const project = await getOwnedProject(session.org.id, projectId);
    if (!project) return notFound("Project not found");

    const [issues, sprints, activity, links] = await Promise.all([
      db.issue.findMany({
        where: { projectId },
        include: issueInclude,
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      db.sprint.findMany({
        where: { projectId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      db.activity.findMany({
        where: { OR: [{ projectId }, { issue: { projectId } }] },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Link edges with BOTH endpoints inside this project (roadmap dependency arrows).
      db.issueLink.findMany({
        where: { source: { projectId }, target: { projectId } },
        select: { id: true, sourceId: true, targetId: true, type: true },
      }),
    ]);

    const now = new Date();
    const sumPoints = (list: typeof issues) =>
      list.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);

    const stats = {
      total: issues.length,
      todo: issues.filter((i) => i.status.category === "TODO").length,
      inProgress: issues.filter((i) => i.status.category === "IN_PROGRESS").length,
      done: issues.filter((i) => i.status.category === "DONE").length,
      points: sumPoints(issues),
      donePoints: sumPoints(issues.filter((i) => i.status.category === "DONE")),
      overdue: issues.filter(
        (i) => i.dueDate != null && i.dueDate < now && i.status.category !== "DONE"
      ).length,
    };

    return NextResponse.json({
      project: toProjectDTO(project),
      issues: issues.map(toIssueDTO),
      sprints: sprints.map(toSprintDTO),
      activity: activity.map(toActivityDTO),
      stats,
      links: links.map((l) => ({ id: l.id, sourceId: l.sourceId, targetId: l.targetId, type: l.type })),
    });
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { projectId } = await ctx.params;

    const project = await getOwnedProject(session.org.id, projectId);
    if (!project) return notFound("Project not found");

    const body = await parseBody(req);
    const data: Prisma.ProjectUncheckedUpdateInput = {};

    if ("name" in body) {
      const v = optStr(body, "name");
      if (v === undefined || !v.trim()) throw new ApiError("name cannot be empty", 400);
      data.name = v.trim();
    }
    if ("description" in body) {
      const v: unknown = body.description;
      const desc =
        v === null || v === undefined ? null : typeof v === "string" ? v : undefined;
      if (desc === undefined) throw new ApiError("Invalid description", 400);
      data.description = desc;
    }
    if ("color" in body) {
      const v = optStr(body, "color");
      if (v) data.color = v;
    }
    if ("icon" in body) {
      const v = optStr(body, "icon");
      if (v) data.icon = v;
    }
    if ("leadId" in body) {
      const leadId = idOrNull(body, "leadId");
      if (leadId) {
        const leadMember = await db.organizationMember.findFirst({
          where: { orgId: session.org.id, userId: leadId },
        });
        if (!leadMember) throw new ApiError("Lead must be a workspace member", 400);
      }
      data.leadId = leadId ?? null;
    }
    const archived = optBool(body, "archived");
    if (archived !== undefined) data.archivedAt = archived ? new Date() : null;

    // ── Board WIP limits: { statusId: max } — validated against org statuses ──
    if ("wipLimits" in body) {
      const raw: unknown = body.wipLimits;
      if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
        throw new ApiError("Invalid wipLimits payload", 400);
      }
      const incoming = (raw ?? {}) as Record<string, unknown>;
      const next: Record<string, number> = {};
      for (const [statusId, limit] of Object.entries(incoming)) {
        if (limit === null || limit === "" || limit === undefined) continue; // cleared
        const n = Number(limit);
        if (!Number.isFinite(n) || n < 1 || n > 99) {
          throw new ApiError("WIP limit must be between 1 and 99", 400);
        }
        const status = await db.status.findFirst({ where: { id: statusId, orgId: session.org.id } });
        if (!status) throw new ApiError("WIP limit refers to an unknown status", 400);
        next[statusId] = Math.round(n);
      }
      data.wipLimits = Object.keys(next).length ? JSON.stringify(next) : null;
    }

    const updated = await db.project.update({
      where: { id: project.id },
      data,
      include: { lead: true, _count: { select: { issues: true } } },
    });
    return NextResponse.json(toProjectDTO(updated));
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN") return forbidden("Only admins can delete projects");
    const { projectId } = await ctx.params;

    const project = await getOwnedProject(session.org.id, projectId);
    if (!project) return notFound("Project not found");

    await db.project.delete({ where: { id: project.id } });
    return NextResponse.json({});
  });
}
