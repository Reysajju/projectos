import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { toMemberDTO } from "@/lib/dto";
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

/** Invite a member: find-or-create user by email, attach to org. ADMIN/MANAGER only. */
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
    if (!(ROLES as readonly string[]).includes(role)) {
      throw new ApiError("Invalid role", 400);
    }

    // Find-or-create the user (invited users get a random, undisclosable password).
    let user = await db.user.findUnique({ where: { email } });
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

    return NextResponse.json(toMemberDTO(member));
  });
}
