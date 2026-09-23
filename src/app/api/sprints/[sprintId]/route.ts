import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { fireWebhooks } from "@/lib/webhooks";
import { toSprintDTO } from "@/lib/dto";
import {
  ApiError,
  canWrite,
  forbidden,
  handle,
  jsonError,
  notFound,
  optDateOrNull,
  optStr,
  optStrOrNull,
  parseBody,
  unauthorized,
} from "@/lib/api-helpers";
import { notifyOrgMembers } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sprintId: string }> };

const SPRINT_STATUSES = ["FUTURE", "ACTIVE", "COMPLETED"];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { sprintId } = await ctx.params;
    const body = await parseBody(req);
    const orgId = session.org.id;

    const sprint = await db.sprint.findUnique({
      where: { id: sprintId },
      include: { project: true },
    });
    if (!sprint || sprint.project.orgId !== orgId) return notFound("Sprint not found");

    // ── Validate new status ──
    const newStatus = optStr(body, "status");
    if (newStatus !== undefined && !SPRINT_STATUSES.includes(newStatus)) {
      throw new ApiError("Invalid sprint status", 400);
    }
    if (newStatus === "ACTIVE" && sprint.status !== "ACTIVE") {
      const otherActive = await db.sprint.findFirst({
        where: { projectId: sprint.projectId, status: "ACTIVE", id: { not: sprint.id } },
      });
      if (otherActive) {
        return jsonError(
          `Another sprint is already active in this project: ${otherActive.name}`,
          409
        );
      }
    }

    // ── Scalar updates ──
    const data: Prisma.SprintUncheckedUpdateInput = {};
    if ("name" in body) {
      const v = optStr(body, "name");
      if (v === undefined || !v.trim()) throw new ApiError("name cannot be empty", 400);
      data.name = v.trim();
    }
    if ("goal" in body) data.goal = optStrOrNull(body, "goal") ?? null;
    if ("startDate" in body) data.startDate = optDateOrNull(body, "startDate") ?? null;
    if ("endDate" in body) data.endDate = optDateOrNull(body, "endDate") ?? null;
    if (newStatus !== undefined && newStatus !== sprint.status) data.status = newStatus;

    const updated = await db.sprint.update({ where: { id: sprint.id }, data });

    // ── Side effects on sprint lifecycle transitions ──
    if (newStatus === "ACTIVE" && sprint.status !== "ACTIVE") {
      await logActivity({
        orgId,
        userId: session.user.id,
        projectId: sprint.projectId,
        type: "sprint.started",
        newValue: updated.name,
      });
      await notifyOrgMembers({
        orgId,
        actorId: session.user.id,
        type: "sprint",
        title: `Sprint started: ${updated.name}`,
        body: `${sprint.project.name} — ${updated.goal ?? "the sprint is now underway"}`,
      });
    }

    if (newStatus === "COMPLETED" && sprint.status !== "COMPLETED") {
      // Unfinished work goes back to the backlog; finished issues stay.
      await db.issue.updateMany({
        where: { sprintId: sprint.id, status: { category: { not: "DONE" } } },
        data: { sprintId: null },
      });
      await logActivity({
        orgId,
        userId: session.user.id,
        projectId: sprint.projectId,
        type: "sprint.completed",
        newValue: updated.name,
      });
      await notifyOrgMembers({
        orgId,
        actorId: session.user.id,
        type: "sprint",
        title: `Sprint completed: ${updated.name}`,
        body: `${sprint.project.name} — unfinished issues were moved back to the backlog`,
      });
      void fireWebhooks("sprint.completed", {
        orgId,
        actor: { id: session.user.id, name: session.user.name },
        data: { sprint: updated.name, project: sprint.project.name },
      });
    }

    return NextResponse.json(toSprintDTO(updated));
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const { sprintId } = await ctx.params;

    const sprint = await db.sprint.findUnique({
      where: { id: sprintId },
      include: { project: true },
    });
    if (!sprint || sprint.project.orgId !== session.org.id) return notFound("Sprint not found");

    // Issues go back to the backlog before the sprint is removed.
    await db.issue.updateMany({ where: { sprintId: sprint.id }, data: { sprintId: null } });
    await db.sprint.delete({ where: { id: sprint.id } });

    return NextResponse.json({});
  });
}
