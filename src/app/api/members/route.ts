import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { toMemberDTO } from "@/lib/dto";
import { appUrl, createAuthToken, deliverEmail } from "@/lib/mailer";
import { inviteEmail } from "@/lib/email-templates";
import {
  ApiError,
  ROLES,
  forbidden,
  handle,
  jsonError,
  optStr,
  optStrOrNull,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_COLORS = ["#d97706", "#059669", "#7c3aed", "#e11d48", "#0d9488", "#ea580c", "#65a30d"];

/**
 * Invite a member: find-or-create user by email, attach to org, and email the
 * invitation. New users get a CLAIM link (?claim=<token>) to set their own
 * password; existing users get a "you've been added" email.
 * ADMIN/MANAGER only.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!["ADMIN", "MANAGER"].includes(session.role)) {
      return forbidden("Only admins and managers can invite members");
    }
    const body = await parseBody(req);
    const orgId = session.org.id;

    const email = reqStr(body, "email").toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("Invalid email address", 400);
    const name = optStr(body, "name")?.trim() || email.split("@")[0];
    const title = optStrOrNull(body, "title") ?? null;
    const role = optStr(body, "role") ?? "MEMBER";
    const sendEmailFlag = body.sendEmail !== false; // default true
    if (!(ROLES as readonly string[]).includes(role)) {
      throw new ApiError("Invalid role", 400);
    }

    // Find-or-create the user (invited users get a random, undisclosable password
    // until they claim their account via the emailed link).
    let user = await db.user.findUnique({ where: { email } });
    let isNewUser = false;
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name,
          title,
          passwordHash: hashPassword(randomBytes(16).toString("hex")),
          avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        },
      });
      isNewUser = true;
    } else if (title) {
      user = await db.user.update({ where: { id: user.id }, data: { title } });
    }

    const existingMember = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (existingMember) {
      return jsonError("User is already a member of this workspace", 409);
    }

    const member = await db.organizationMember.create({
      data: { orgId, userId: user.id, role },
      include: { user: true },
    });

    await logActivity({
      orgId,
      userId: session.user.id,
      type: "member.joined",
      field: "role",
      newValue: `${member.user.name} (${role})`,
    });

    // ── Invitation email (claim link for brand-new users) ──
    let emailStatus: string | null = null;
    let claimToken: string | null = null;
    if (sendEmailFlag) {
      claimToken = isNewUser ? await createAuthToken(user.id, "CLAIM", 24 * 7) : null;
      const base = appUrl();
      const tpl = inviteEmail({
        appUrl: base,
        orgName: session.org.name,
        inviterName: session.user.name,
        role,
        recipientName: user.name,
        claimUrl: claimToken
          ? `${base}/?claim=${encodeURIComponent(claimToken)}`
          : null,
        isNewUser,
      });
      const result = await deliverEmail({
        orgId,
        userId: user.id,
        toEmail: user.email,
        kind: "INVITE",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        transactional: true,
        meta: { inviter: session.user.email, role, isNewUser },
      });
      emailStatus = result.status;
    }

    return NextResponse.json({ ...toMemberDTO(member), emailStatus, claimToken });
  });
}
