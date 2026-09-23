import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, destroySession, sessionCookieOptions } from "@/lib/auth";
import { handle } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await destroySession(token);
    const res = NextResponse.json({});
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
  });
}
