import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  seedOrgDefaults,
  sessionCookieOptions,
} from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { ApiError, handle, jsonError, optStr, parseBody, reqStr } from "@/lib/api-helpers";
import { appUrl, queueEmail } from "@/lib/mailer";
import { welcomeEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req);
    const email = reqStr(body, "email").toLowerCase();
    const name = reqStr(body, "name");
    const orgName = reqStr(body, "orgName");
    const orgSlugInput = optStr(body, "orgSlug") ?? "";
    const password = typeof body?.password === "string" ? body.password : null;
    if (!EMAIL_RE.test(email)) throw new ApiError("Invalid email address", 400);

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) return jsonError("Email already registered. Please sign in via Magic Link.", 409);

    // Slug: sanitize, then unique-ify by appending -2, -3, ... when taken.
    const base = slugify(orgSlugInput) || slugify(orgName) || "workspace";
    let slug = base;
    let n = 2;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${n}`;
      n += 1;
      if (n > 99) {
        slug = `${base}-${Date.now().toString(36)}`;
        break;
      }
    }

    const user = await db.user.create({
      data: { email, name, passwordHash: password ? hashPassword(password) : null },
    });
    const org = await db.organization.create({ data: { name: orgName, slug } });
    await db.organizationMember.create({
      data: { orgId: org.id, userId: user.id, role: "ADMIN" },
    });
    await seedOrgDefaults(org.id);

    const token = await createSession(user.id);

    // Welcome email (fire-and-forget; SIMULATED outbox row when SMTP is off).
    const tpl = welcomeEmail({
      appUrl: appUrl(),
      name: user.name,
      orgName: org.name,
    });
    await queueEmail({
      orgId: org.id,
      userId: user.id,
      toEmail: user.email,
      kind: "WELCOME",
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      transactional: true,
      meta: { trigger: "signup" },
    });

    const res = NextResponse.json({ user: toUserDTO(user), org: toOrgDTO(org) });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
    return res;
  });
}
