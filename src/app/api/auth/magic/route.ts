import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  seedOrgDefaults,
  sessionCookieOptions,
} from "@/lib/auth";
import { appUrl, consumeAuthToken, createAuthToken, deliverEmail } from "@/lib/mailer";
import { magicLinkEmail } from "@/lib/email-templates";
import { handle, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/magic { email, name? }
 * Sends a single-use magic sign-in link to the email. If the account doesn't exist,
 * automatically creates the user and joins the workspace.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const email = reqStr(body, "email").toLowerCase().trim();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      const derivedName = name || email.split("@")[0].replace(/[._-]/g, " ");
      user = await db.user.create({
        data: {
          email,
          name: derivedName,
          avatarColor: "#d97706",
          title: "Member",
        },
      });

      let defaultOrg = await db.organization.findFirst();
      if (!defaultOrg) {
        defaultOrg = await db.organization.create({
          data: { name: "Workspace", slug: "workspace" },
        });
        await seedOrgDefaults(defaultOrg.id);
      }

      await db.organizationMember.create({
        data: { orgId: defaultOrg.id, userId: user.id, role: "ADMIN" },
      });
    }

    const token = await createAuthToken(user.id, "MAGIC_LINK", 0.5); // 30 minutes
    const base = appUrl();
    const magicUrl = `${base}/api/auth/magic?token=${encodeURIComponent(token)}`;

    const tpl = magicLinkEmail({
      appUrl: base,
      name: user.name,
      magicUrl,
    });

    const member = await db.organizationMember.findFirst({ where: { userId: user.id } });
    const defaultOrg = !member ? await db.organization.findFirst() : null;
    const orgId = member?.orgId || defaultOrg?.id || "system";

    await deliverEmail({
      orgId,
      userId: user.id,
      toEmail: user.email,
      kind: "MAGIC_LINK",
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      transactional: true,
      meta: { trigger: "magic-link-request" },
    });

    return NextResponse.json({ ok: true, email: user.email });
  });
}

/**
 * GET /api/auth/magic?token=xyz
 * Direct click from email: consumes token, establishes session cookie, and redirects into the app.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/?auth_error=missing_token", req.url));
  }

  const claimed = await consumeAuthToken(token, "MAGIC_LINK");
  if (!claimed) {
    return NextResponse.redirect(new URL("/?auth_error=expired", req.url));
  }

  const user = await db.user.findUnique({ where: { id: claimed.userId } });
  if (!user) {
    return NextResponse.redirect(new URL("/?auth_error=user_not_found", req.url));
  }

  const sessionToken = await createSession(user.id);
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(req));
  return res;
}
