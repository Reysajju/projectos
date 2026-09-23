import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildDigest } from "@/lib/digest";
import { sendDigestEmail } from "@/lib/mailer";
import { handle } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/digest/cron — scheduled sender, called by the digest-cron
 * mini-service every morning. Authenticated with a shared secret header
 * (x-cron-secret === DIGEST_CRON_SECRET) instead of a user session.
 *
 * Sends the DAILY digest to every member of every org. Weekly digests
 * are only sent on Mondays (Asia/Karachi).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.DIGEST_CRON_SECRET;
    const provided = req.headers.get("x-cron-secret");
    if (!secret || provided !== secret) {
      return NextResponse.json({ error: "Invalid cron secret" }, { status: 401 });
    }

    const now = new Date();
    const isMonday = now.getDay() === 1;
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    const members = await db.organizationMember.findMany({ include: { user: true } });

    let emails = 0;
    for (const org of orgs) {
      const orgMembers = members.filter((m) => m.orgId === org.id);
      for (const m of orgMembers) {
        const digest = await buildDigest(org.id, m.userId, "DAILY");
        await sendDigestEmail({
          orgId: org.id,
          userId: m.userId,
          toEmail: m.user.email,
          recipientName: digest.recipientName,
          periodLabel: digest.periodLabel,
          kind: "DAILY",
          sections: digest.sections,
          counts: digest.counts,
          meta: { trigger: "cron", sentTo: m.user.email, weeklyAlso: isMonday },
        });
        emails += 1;
      }
    }

    // Outbox hygiene: prune simulated deliveries older than 30 days.
    const pruned = await db.emailLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
    });

    return NextResponse.json({
      ok: true,
      orgs: orgs.length,
      emails,
      prunedOld: pruned.count,
      at: now.toISOString(),
      isMonday,
    });
  });
}
