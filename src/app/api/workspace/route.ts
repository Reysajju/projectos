import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  toLabelDTO,
  toMemberDTO,
  toPriorityDTO,
  toProjectDTO,
  toStatusDTO,
  toTypeDTO,
  toUserDTO,
  toOrgDTO,
} from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Full bootstrap payload: everything the SPA needs after login. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;

    const [members, projects, issueTypes, statuses, priorities, labels] = await Promise.all([
      db.organizationMember.findMany({
        where: { orgId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      db.project.findMany({
        where: { orgId },
        include: { lead: true, _count: { select: { issues: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.issueType.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
      db.status.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
      db.priority.findMany({ where: { orgId }, orderBy: { order: "asc" } }),
      db.label.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    ]);

    return NextResponse.json({
      user: toUserDTO(session.user),
      org: toOrgDTO(session.org),
      role: session.role,
      members: members.map(toMemberDTO),
      projects: projects.map(toProjectDTO),
      issueTypes: issueTypes.map(toTypeDTO),
      statuses: statuses.map(toStatusDTO),
      priorities: priorities.map(toPriorityDTO),
      labels: labels.map(toLabelDTO),
    });
  });
}
