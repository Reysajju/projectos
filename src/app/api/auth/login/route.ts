import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { handle, jsonError, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const email = reqStr(body, "email").toLowerCase();
    const password = reqStr(body, "password");

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonError("Invalid email or password", 401);
    }

    // Org = first membership (createdAt asc). No membership → cannot use the portal.
    const membership = await db.organizationMember.findFirst({
      where: { userId: user.id },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return jsonError("No workspace", 400);

    const token = await createSession(user.id);
    const res = NextResponse.json({
      user: toUserDTO(user),
      org: toOrgDTO(membership.org),
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
    return res;
  });
}
