import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, clip, handle, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Per-user preference store (blueprint §6).
 * GET  /api/preferences          → { [key]: unknown }
 * PATCH /api/preferences {key,value} → upserts one pref (value: JSON-able).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const rows = await db.userPreference.findMany({ where: { userId: session.user.id } });
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        out[row.key] = row.value;
      }
    }
    return NextResponse.json(out);
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const body = await parseBody(req);
    const key = clip(reqStr(body, "key"), 60);
    if (!key) throw new ApiError("key is required");
    if (!("value" in body)) throw new ApiError("value is required");
    const value = JSON.stringify(body.value ?? null);
    if (value.length > 10_000) throw new ApiError("value too large");

    await db.userPreference.upsert({
      where: { userId_key: { userId: session.user.id, key } },
      create: { userId: session.user.id, key, value },
      update: { value },
    });

    return NextResponse.json({ ok: true, key, value: body.value ?? null });
  });
}
