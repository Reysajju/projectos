import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuthToken, deliverEmail } from "@/lib/mailer";
import { resetEmail } from "@/lib/email-templates";
import { handle, parseBody, reqStr } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/forgot-password { email }
 * Always answers 200 (no account enumeration). If the account exists, emails
 * a single-use RESET link (?reset=<token>, valid 1 hour).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const email = reqStr(body, "email").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: true });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const raw = await createAuthToken(user.id, "RESET", 1);
      const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
      const tpl = resetEmail({
        appUrl: base,
        name: user.name,
        resetUrl: `${base}/?reset=${encodeURIComponent(raw)}`,
      });
      await deliverEmail({
        orgId: (await db.organizationMember.findFirst({ where: { userId: user.id } }))?.orgId ?? "system",
        userId: user.id,
        toEmail: user.email,
        kind: "RESET",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        transactional: true,
        meta: { trigger: "forgot-password" },
      });
    }

    return NextResponse.json({ ok: true });
  });
}
