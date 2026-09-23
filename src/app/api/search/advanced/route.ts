import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueInclude, toIssueDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";
import { buildWhere, JqlError, parseJql } from "@/lib/jql";

export const dynamic = "force-dynamic";

/** POST /api/search/advanced — JQL-lite search. Body: { query: string } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;

    const body = (await req.json().catch(() => ({}))) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ issues: [], parsed: "", error: "Enter a query" });
    }

    let node;
    try {
      node = parseJql(query);
    } catch (err) {
      if (err instanceof JqlError) {
        return NextResponse.json({ issues: [], parsed: "", error: err.message });
      }
      throw err;
    }

    const [statuses, types, priorities, labels, members, projects, sprints, customFields] = await Promise.all([
      db.status.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.issueType.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.priority.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.label.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.organizationMember.findMany({
        where: { orgId },
        select: { userId: true, user: { select: { name: true, email: true } } },
      }),
      db.project.findMany({ where: { orgId }, select: { id: true, key: true, name: true } }),
      db.sprint.findMany({
        where: { project: { orgId } },
        select: { id: true, name: true },
      }),
      db.customField.findMany({ where: { orgId }, select: { id: true, name: true, type: true } }),
    ]);

    const where = buildWhere(node, {
      orgId,
      meId: session.user.id,
      statuses,
      types,
      priorities,
      labels,
      members,
      projects,
      sprints,
      customFields,
    });

    const issues = await db.issue.findMany({
      where,
      include: issueInclude,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      issues: issues.map(toIssueDTO),
      parsed: query,
      error: null,
    });
  });
}
