import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toMemberDTO } from "@/lib/dto";
import {
  ApiError,
  ROLES,
  forbidden,
  handle,
  notFound,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string }> };

/** Change a member's org role. ADMIN only. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN") return forbidden("Only admins can change roles");
    const { userId } = await ctx.params;
    const body = await parseBody(req);

    const role = reqStr(body, "role");
    if (!(ROLES as readonly string[]).includes(role)) throw new ApiError("Invalid role", 400);

    const member = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId: session.org.id, userId } },
      include: { user: true },
    });
    if (!member) return notFound("Member not found");

    const updated = await db.organizationMember.update({
      where: { id: member.id },
      data: { role },
      include: { user: true },
    });

    return NextResponse.json(toMemberDTO(updated));
  });
}
