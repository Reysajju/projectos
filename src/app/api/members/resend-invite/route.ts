import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createAuthToken, deliverEmail } from "@/lib/mailer";
import { inviteEmail } from "@/lib/email-templates";
import { ApiError, forbidden, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/members/resend-invite { userId }
 * Re-sends the invitation email for a member who has never claimed their
 * account (never set a password themselves). ADMIN/MANAGER only.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!["ADMIN", "MANAGER"].includes(session.role)) {
      return forbidden("Only admins and managers can resend invitations");
    }
    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) throw new ApiError("userId is required", 400);

    const member = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId: session.org.id, userId } },
      include: { user: true },
    });
    if (!member) return notFound("Member not found");

    const raw = await createAuthToken(member.user.id, "CLAIM", 24 * 7);
    const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const tpl = inviteEmail({
      appUrl: base,
      orgName: session.org.name,
      inviterName: session.user.name,
      role: member.role,
      recipientName: member.user.name,
      claimUrl: `${base}/?claim=${encodeURIComponent(raw)}`,
      isNewUser: true,
    });
    const result = await deliverEmail({
      orgId: session.org.id,
      userId: member.user.id,
      toEmail: member.user.email,
      kind: "INVITE",
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      transactional: true,
      meta: { inviter: session.user.email, role: member.role, resend: true },
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      claimToken: raw,
      message:
        result.status === "SENT"
          ? `Invitation emailed to ${member.user.email}`
          : result.status === "SIMULATED"
            ? "SMTP not configured — invite recorded in the outbox (copy the link to share it manually)"
            : `Delivery failed: ${result.error ?? "unknown error"}`,
    });
  });
}
