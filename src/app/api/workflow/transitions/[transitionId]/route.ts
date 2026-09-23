import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, unauthorized, forbidden, notFound } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** DELETE /api/workflow/transitions/[transitionId] — remove a directed edge. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ transitionId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") return forbidden("Only admins and managers can edit the workflow");
    const { transitionId } = await params;

    const transition = await db.workflowTransition.findFirst({
      where: { id: transitionId, orgId: session.org.id },
    });
    if (!transition) return notFound();

    await db.workflowTransition.delete({ where: { id: transitionId } });
    return NextResponse.json({});
  });
}
