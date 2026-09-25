import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { consumeAuthToken } from "@/lib/mailer";
import { handle, jsonError, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/magic/verify { token }
 * In-app token verification (single-page app flow). Returns user & org DTOs, sets session cookie.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const token = reqStr(body, "token");

    const claimed = await consumeAuthToken(token, "MAGIC_LINK");
    if (!claimed) {
      return jsonError("This sign-in link is invalid, already used, or expired.", 400);
    }

    const user = await db.user.findUnique({ where: { id: claimed.userId } });
    if (!user) return jsonError("User account not found", 404);

    let membership = await db.organizationMember.findFirst({
      where: { userId: user.id },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      const defaultOrg = await db.organization.findFirst();
      if (defaultOrg) {
        membership = await db.organizationMember.create({
          data: { orgId: defaultOrg.id, userId: user.id, role: "MEMBER" },
          include: { org: true },
        });
      }
    }

    if (!membership) return jsonError("No workspace available", 400);

    const sessionToken = await createSession(user.id);
    const res = NextResponse.json({
      user: toUserDTO(user),
      org: toOrgDTO(membership.org),
    });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(req));
    return res;
  });
}
