import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { badRequest, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_DAYS = 91;

/**
 * Burndown for a sprint. Remaining story points per day = total − Σ storyPoints
 * of issues whose status became DONE by that day (approximated via issue.updatedAt
 * on issues that are currently DONE). Ideal line runs linearly total → 0.
 * Falls back to the last 14 days when the sprint has no date range.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const sprintId = req.nextUrl.searchParams.get("sprintId");
    if (!sprintId) return badRequest("sprintId is required");

    const sprint = await db.sprint.findUnique({
      where: { id: sprintId },
      include: { project: true },
    });
    if (!sprint || sprint.project.orgId !== session.org.id) return notFound("Sprint not found");

    const issues = await db.issue.findMany({
      where: { sprintId },
      select: { storyPoints: true, status: { select: { category: true } }, updatedAt: true },
    });

    const total = issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
    const completed = issues
      .filter((i) => i.status.category === "DONE")
      .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);

    const midnight = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    let start: Date;
    let end: Date;
    if (sprint.startDate && sprint.endDate) {
      start = midnight(new Date(sprint.startDate));
      end = midnight(new Date(sprint.endDate));
    } else {
      end = midnight(new Date());
      start = midnight(new Date(end.getTime() - 13 * DAY_MS));
    }
    if (end.getTime() < start.getTime()) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    if (end.getTime() - start.getTime() > (MAX_DAYS - 1) * DAY_MS) {
      start = new Date(end.getTime() - (MAX_DAYS - 1) * DAY_MS);
    }

    // Collect one timestamp per calendar day (DST-safe stepping).
    const dayStarts: number[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      dayStarts.push(cursor.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    const n = dayStarts.length;
    const points = dayStarts.map((t, idx) => {
      const cutoff = t + DAY_MS - 1;
      let doneBy = 0;
      for (const issue of issues) {
        if (issue.status.category === "DONE" && issue.updatedAt.getTime() <= cutoff) {
          doneBy += issue.storyPoints ?? 0;
        }
      }
      const remaining = Math.max(0, total - doneBy);
      const ideal =
        n > 1 ? Math.round(total * (1 - idx / (n - 1)) * 100) / 100 : total;
      const d = new Date(t);
      return {
        date: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        remaining,
        ideal,
      };
    });

    return NextResponse.json({ total, completed, points });
  });
}
