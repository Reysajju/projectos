import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** DELETE /api/filters/[filterId] — owner or ADMIN only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ filterId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { filterId } = await params;

    const filter = await db.savedFilter.findUnique({ where: { id: filterId } });
    if (!filter || filter.orgId !== session.org.id) return notFound("Filter not found");
    if (filter.ownerId !== session.user.id && session.role !== "ADMIN") {
      throw new ApiError("Only the filter owner or an admin can delete it", 403);
    }

    await db.savedFilter.delete({ where: { id: filterId } });
    return NextResponse.json({});
  });
}
