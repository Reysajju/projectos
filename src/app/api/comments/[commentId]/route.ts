import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { forbidden, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ commentId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { commentId } = await ctx.params;

    const comment = await db.comment.findUnique({
      where: { id: commentId },
      include: { issue: { select: { orgId: true } } },
    });
    if (!comment || comment.issue.orgId !== session.org.id) return notFound("Comment not found");

    // Author or ADMIN only.
    if (comment.authorId !== session.user.id && session.role !== "ADMIN") {
      return forbidden("You can only delete your own comments");
    }

    await db.comment.delete({ where: { id: comment.id } });
    return NextResponse.json({});
  });
}
