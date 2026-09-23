import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Velocity per sprint (COMPLETED + ACTIVE), ascending, most recent 8. */
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

    const sprints = await db.sprint.findMany({
      where: {
        status: { in: ["COMPLETED", "ACTIVE"] },
        project: { orgId },
        ...(projectId ? { projectId } : {}),
      },
      include: {
        issues: { select: { storyPoints: true, status: { select: { category: true } } } },
      },
    });

    const withSortKey = sprints.map((s) => ({
      id: s.id,
      name: s.name,
      committed: s.issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
      completed: s.issues
        .filter((i) => i.status.category === "DONE")
        .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
      sortKey: (s.startDate ?? s.endDate ?? s.createdAt).getTime(),
    }));

    withSortKey.sort((a, b) => a.sortKey - b.sortKey);
    const recent = withSortKey.slice(-8);

    return NextResponse.json({
      sprints: recent.map(({ id, name, committed, completed }) => ({
        id,
        name,
        committed,
        completed,
      })),
    });
  });
}
