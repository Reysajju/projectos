import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, handle, parseBody, unauthorized, forbidden, idOrNull } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** POST /api/workflow/transitions — add a directed edge { fromStatusId, toStatusId }. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") return forbidden("Only admins and managers can edit the workflow");
    const orgId = session.org.id;

    const body = await parseBody(req);
    const fromStatusId = idOrNull(body, "fromStatusId");
    const toStatusId = idOrNull(body, "toStatusId");
    if (!fromStatusId || !toStatusId) throw new ApiError("fromStatusId and toStatusId are required", 400);
    if (fromStatusId === toStatusId) throw new ApiError("A status cannot transition to itself", 400);

    const [from, to] = await Promise.all([
      db.status.findFirst({ where: { id: fromStatusId, orgId } }),
      db.status.findFirst({ where: { id: toStatusId, orgId } }),
    ]);
    if (!from || !to) throw new ApiError("Both statuses must exist in this workspace", 400);

    const existing = await db.workflowTransition.findUnique({
      where: { orgId_fromStatusId_toStatusId: { orgId, fromStatusId, toStatusId } },
    });
    if (existing) throw new ApiError("This transition already exists", 409);

    const transition = await db.workflowTransition.create({
      data: { orgId, fromStatusId, toStatusId },
      include: {
        fromStatus: { select: { id: true, name: true, color: true } },
        toStatus: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json({
      transition: {
        id: transition.id,
        fromStatusId: transition.fromStatusId,
        toStatusId: transition.toStatusId,
      },
    });
  });
}
