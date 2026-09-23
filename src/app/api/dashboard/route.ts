import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueInclude, toActivityDTO, toIssueDTO, toSprintDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;
    const me = session.user.id;
    const now = new Date();

    // Monday 00:00 of the current week.
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    // First day (00:00) of the last 14 days, today included.
    const start14 = new Date(now.getTime() - 13 * DAY_MS);
    start14.setHours(0, 0, 0, 0);

    const [
      myOpen,
      totalIssues,
      openIssues,
      completedThisWeek,
      activeSprints,
      myIssues,
      upcomingDue,
      activity,
      createdRows,
      resolvedRows,
      activeSprintRows,
    ] = await Promise.all([
      db.issue.count({ where: { orgId, assigneeId: me, status: { category: { not: "DONE" } } } }),
      db.issue.count({ where: { orgId } }),
      db.issue.count({ where: { orgId, status: { category: { not: "DONE" } } } }),
      db.issue.count({
        where: { orgId, status: { category: "DONE" }, updatedAt: { gte: weekStart } },
      }),
      db.sprint.count({ where: { project: { orgId }, status: "ACTIVE" } }),
      db.issue.findMany({
        where: { orgId, assigneeId: me, status: { category: { not: "DONE" } } },
        include: issueInclude,
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      db.issue.findMany({
        where: {
          orgId,
          assigneeId: me,
          dueDate: { not: null },
          status: { category: { not: "DONE" } },
        },
        include: issueInclude,
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      db.activity.findMany({
        where: { orgId },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.issue.findMany({
        where: { orgId, createdAt: { gte: start14 } },
        select: { createdAt: true },
      }),
      db.issue.findMany({
        where: { orgId, status: { category: "DONE" }, updatedAt: { gte: start14 } },
        select: { updatedAt: true },
      }),
      db.sprint.findMany({
        where: { project: { orgId }, status: "ACTIVE" },
        include: {
          project: { select: { key: true, name: true } },
          issues: { select: { storyPoints: true, status: { select: { category: true } } } },
        },
      }),
    ]);

    // ── Created vs resolved, bucketed per day (MM-DD) ──
    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const buckets: { date: string; created: number; resolved: number }[] = [];
    const bucketIndex = new Map<string, number>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start14.getTime() + i * DAY_MS);
      bucketIndex.set(fmt(d), buckets.length);
      buckets.push({ date: fmt(d), created: 0, resolved: 0 });
    }
    for (const row of createdRows) {
      const idx = bucketIndex.get(fmt(row.createdAt));
      if (idx !== undefined) buckets[idx].created += 1;
    }
    for (const row of resolvedRows) {
      const idx = bucketIndex.get(fmt(row.updatedAt));
      if (idx !== undefined) buckets[idx].resolved += 1;
    }

    const activeSprintCards = activeSprintRows.map((s) => {
      const done = s.issues.filter((i) => i.status.category === "DONE");
      return {
        sprint: toSprintDTO(s),
        projectName: s.project.name,
        projectKey: s.project.key,
        total: s.issues.length,
        done: done.length,
        points: s.issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
        donePoints: done.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
      };
    });

    return NextResponse.json({
      stats: { myOpen, totalIssues, openIssues, completedThisWeek, activeSprints },
      myIssues: myIssues.map(toIssueDTO),
      upcomingDue: upcomingDue.map(toIssueDTO),
      activity: activity.map(toActivityDTO),
      createdVsResolved: buckets,
      activeSprintCards,
    });
  });
}
