import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { consumeAuthToken } from "@/lib/mailer";
import { ApiError, handle, jsonError, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password { token, password }
 * Validates the single-use RESET token and sets the new password.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const token = reqStr(body, "token");
    const password = body.password;
    if (typeof password !== "string" || password.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }

    const claimed = await consumeAuthToken(token, "RESET");
    if (!claimed) {
      return jsonError("This reset link is invalid, already used, or expired. Request a new one.", 400);
    }

    const user = await db.user.update({
      where: { id: claimed.userId },
      data: { passwordHash: hashPassword(password) },
    });

    // Invalidate all existing sessions after a password change.
    await db.session.deleteMany({ where: { userId: user.id } });

    const membership = await db.organizationMember.findFirst({
      where: { userId: user.id },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return jsonError("No workspace", 400);

    const sessionToken = await createSession(user.id);
    const res = NextResponse.json({
      user: toUserDTO(user),
      org: toOrgDTO(membership.org),
    });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(req));
    return res;
  });
}
