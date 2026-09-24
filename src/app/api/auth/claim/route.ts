import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { consumeAuthToken } from "@/lib/mailer";
import { ApiError, clip, handle, jsonError, optStr, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/claim { token, name?, password }
 * Completes an invitation: validates the CLAIM token emailed to the invitee,
 * sets their display name + password, and signs them in.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const token = reqStr(body, "token");
    const name = clip(optStr(body, "name") ?? "", 80)?.trim() ?? "";
    const password = body.password;
    if (typeof password !== "string" || password.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }

    const claimed = await consumeAuthToken(token, "CLAIM");
    if (!claimed) {
      return jsonError(
        "This invitation link is invalid, already used, or expired. Ask your workspace admin to resend the invite.",
        400
      );
    }

    const user = await db.user.update({
      where: { id: claimed.userId },
      data: {
        passwordHash: hashPassword(password),
        ...(name ? { name } : {}),
      },
    });

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

/** GET /api/auth/claim?token=... — read-only validation for the claim screen. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const row = await db.authToken.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!row || row.purpose !== "CLAIM" || row.usedAt || row.expiresAt < new Date()) {
      return NextResponse.json({ valid: false });
    }
    return NextResponse.json({
      valid: true,
      name: row.user.name,
      email: row.user.email,
      expiresAt: row.expiresAt.toISOString(),
    });
  });
}
