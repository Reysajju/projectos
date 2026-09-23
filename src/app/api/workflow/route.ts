import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, unauthorized, forbidden } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflow → the org's workflow graph.
 * statuses: ordered statuses with issue counts; transitions: directed edges.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;

    const [statusesRaw, transitionsRaw, counts] = await Promise.all([
      db.status.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
      db.workflowTransition.findMany({
        where: { orgId },
        include: {
          fromStatus: { select: { id: true, name: true, color: true } },
          toStatus: { select: { id: true, name: true, color: true } },
        },
        orderBy: { id: "asc" },
      }),
      db.issue.groupBy({ by: ["statusId"], where: { orgId }, _count: { _all: true } }),
    ]);

    const countMap = new Map(counts.map((c) => [c.statusId, c._count._all]));
    const statuses = statusesRaw.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category as "TODO" | "IN_PROGRESS" | "DONE",
      color: s.color,
      order: s.order,
      isInitial: s.isInitial,
      issueCount: countMap.get(s.id) ?? 0,
    }));
    const transitions = transitionsRaw.map((t) => ({
      id: t.id,
      fromStatusId: t.fromStatusId,
      toStatusId: t.toStatusId,
    }));

    return NextResponse.json({
      statuses,
      transitions,
      // Open workflow = no explicit edges configured → every move is allowed.
      restricted: transitions.length > 0,
    });
  });
}
