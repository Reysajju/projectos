import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, canManage, handle, notFound, unauthorized } from "@/lib/api-helpers";
import { logActivity } from "@/lib/workflow";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ keyId: string }> };

/** DELETE /api/keys/:id — revoke (never delete: audit keeps the prefix). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) throw new ApiError("Only ADMIN/MANAGER can revoke API keys", 403);
    const { keyId } = await ctx.params;

    const key = await db.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.orgId !== session.org.id) return notFound("API key not found");
    if (key.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true });

    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await logActivity({
      orgId: session.org.id,
      userId: session.user.id,
      type: "apikey.revoked",
      oldValue: `${key.name} (${key.prefix}…)`,
    });

    return NextResponse.json({ ok: true });
  });
}
