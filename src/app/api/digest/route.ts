import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildDigest, sendEmail, type DigestKind } from "@/lib/digest";
import { ApiError, canManage, handle, parseBody, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function parseKind(v: unknown): DigestKind {
  return v === "WEEKLY" ? "WEEKLY" : "DAILY";
}

/** GET /api/digest?kind=DAILY|WEEKLY — preview the current user's digest. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const kind = parseKind(new URL(req.url).searchParams.get("kind"));
    const digest = await buildDigest(session.org.id, session.user.id, kind);
    return NextResponse.json({
      recipient: { name: session.user.name, email: session.user.email },
      ...digest,
    });
  });
}

/**
 * POST /api/digest/send { kind, userIds?, all? }
 * Any member may send to themselves; sending to others requires ADMIN/MANAGER.
 * Deliveries are recorded in the EmailLog outbox (sandbox = SIMULATED).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const body = await parseBody(req);
    const kind = parseKind(body.kind);
    const all = body.all === true;
    const userIds = Array.isArray(body.userIds)
      ? (body.userIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    let targets: { id: string; email: string; name: string }[];
    if (all) {
      if (!canManage(session.role)) throw new ApiError("Only admins and managers can send to everyone", 403);
      const members = await db.organizationMember.findMany({
        where: { orgId: session.org.id },
        include: { user: true },
      });
      targets = members.map((m) => ({ id: m.userId, email: m.user.email, name: m.user.name }));
    } else if (userIds.length > 0) {
      if (userIds.some((id) => id !== session.user.id) && !canManage(session.role)) {
        throw new ApiError("Only admins and managers can send to other members", 403);
      }
      const members = await db.organizationMember.findMany({
        where: { orgId: session.org.id, userId: { in: userIds } },
        include: { user: true },
      });
      targets = members.map((m) => ({ id: m.userId, email: m.user.email, name: m.user.name }));
    } else {
      targets = [{ id: session.user.id, email: session.user.email, name: session.user.name }];
    }

    if (targets.length === 0) throw new ApiError("No recipients matched", 400);

    let sent = 0;
    for (const t of targets) {
      const digest = await buildDigest(session.org.id, t.id, kind);
      await sendEmail({
        orgId: session.org.id,
        userId: t.id,
        toEmail: t.email,
        kind: kind === "DAILY" ? "DAILY_DIGEST" : "WEEKLY_DIGEST",
        subject: digest.subject,
        body: digest.text,
        meta: {
          trigger: "manual",
          sentBy: session.user.email,
          counts: digest.counts,
        },
      });
      sent += 1;
    }

    return NextResponse.json({ sent, kind });
  });
}
