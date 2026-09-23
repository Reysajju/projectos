import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Distribution analytics for the whole org, or one project when ?projectId= is given. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || project.orgId !== orgId) return notFound("Project not found");
    }

    const base = { orgId, ...(projectId ? { projectId } : {}) };

    const [statuses, priorities, types, members, byStatus, byPriority, byType, openBy, doneBy] =
      await Promise.all([
        db.status.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
        db.priority.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
        db.issueType.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
        db.organizationMember.findMany({ where: { orgId }, include: { user: true } }),
        db.issue.groupBy({ by: ["statusId"], where: base, _count: true }),
        db.issue.groupBy({ by: ["priorityId"], where: base, _count: true }),
        db.issue.groupBy({ by: ["typeId"], where: base, _count: true }),
        db.issue.groupBy({
          by: ["assigneeId"],
          where: { ...base, assigneeId: { not: null }, status: { category: { not: "DONE" } } },
          _count: true,
        }),
        db.issue.groupBy({
          by: ["assigneeId"],
          where: { ...base, assigneeId: { not: null }, status: { category: "DONE" } },
          _count: true,
        }),
      ]);

    const statusCounts = new Map(byStatus.map((r) => [r.statusId, r._count]));
    const priorityCounts = new Map(
      byPriority.filter((r) => r.priorityId).map((r) => [r.priorityId as string, r._count])
    );
    const typeCounts = new Map(byType.map((r) => [r.typeId, r._count]));
    const openCounts = new Map(
      openBy.filter((r) => r.assigneeId).map((r) => [r.assigneeId as string, r._count])
    );
    const doneCounts = new Map(
      doneBy.filter((r) => r.assigneeId).map((r) => [r.assigneeId as string, r._count])
    );

    const statusDist = statuses.map((s) => ({
      name: s.name,
      color: s.color,
      count: statusCounts.get(s.id) ?? 0,
    }));
    const priorityDist = priorities.map((p) => ({
      name: p.name,
      color: p.color,
      count: priorityCounts.get(p.id) ?? 0,
    }));
    const typeDist = types.map((t) => ({
      name: t.name,
      color: t.color,
      count: typeCounts.get(t.id) ?? 0,
    }));
    const assigneeLoad = members
      .map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarColor: m.user.avatarColor,
        open: openCounts.get(m.userId) ?? 0,
        done: doneCounts.get(m.userId) ?? 0,
      }))
      .filter((r) => r.open > 0 || r.done > 0)
      .sort((a, b) => b.open - a.open);

    return NextResponse.json({ statusDist, priorityDist, assigneeLoad, typeDist });
  });
}
