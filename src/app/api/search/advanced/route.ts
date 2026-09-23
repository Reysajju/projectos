import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueInclude, toIssueDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";
import { buildWhere, JqlError, parseJqlQuery, type JqlOrderBy } from "@/lib/jql";

export const dynamic = "force-dynamic";

/**
 * DB-level orderBy mapping for ORDER BY fields. `cf.<Name>` is handled
 * in memory (SQLite JSON), everything else sorts at the query level.
 */
function dbOrderBy(ob: JqlOrderBy): Record<string, unknown> | null {
  const dir = ob.dir;
  switch (ob.field) {
    case "priority": return { priority: { order: dir } };
    case "status": return { status: { order: dir } };
    case "type": return { type: { order: dir } };
    case "project": return { project: { key: dir } };
    case "sprint": return { sprint: { name: dir } };
    case "assignee": return { assignee: { name: dir } };
    case "reporter": return { reporter: { name: dir } };
    case "summary": return { summary: dir };
    case "points": return { storyPoints: { sort: dir, nulls: "last" } };
    case "due": return { dueDate: { sort: dir, nulls: "last" } };
    case "created": return { createdAt: dir };
    case "updated": return { updatedAt: dir };
    default: return null; // cf.<field> → in-memory
  }
}

/** Compare two issue DTOs by a custom-field value (number-aware, nulls last). */
function compareCustom(
  a: { customFields?: Record<string, string | null> | null },
  b: { customFields?: Record<string, string | null> | null },
  fieldId: string,
  type: string,
): number {
  const av = a.customFields?.[fieldId] ?? null;
  const bv = b.customFields?.[fieldId] ?? null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last
  if (bv == null) return -1;
  if (type === "NUMBER") {
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  }
  if (type === "CHECKBOX") {
    return (av === "true" ? 1 : 0) - (bv === "true" ? 1 : 0);
  }
  return String(av).localeCompare(String(bv));
}

/** POST /api/search/advanced — JQL-lite search with IN / NOT IN / ORDER BY. Body: { query: string } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const orgId = session.org.id;

    const body = (await req.json().catch(() => ({}))) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ issues: [], parsed: "", error: "Enter a query", sortedBy: null, sortedDir: null });
    }

    let node;
    let orderBy: JqlOrderBy | null;
    try {
      ({ node, orderBy } = parseJqlQuery(query));
    } catch (err) {
      if (err instanceof JqlError) {
        return NextResponse.json({ issues: [], parsed: "", error: err.message, sortedBy: null, sortedDir: null });
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

    // Custom-field sort: resolve cf:<name> → field def, sort in memory after fetch.
    const cfSort =
      orderBy?.field.startsWith("cf:") &&
      customFields.find((f) => `cf:${f.name.toLowerCase()}` === orderBy!.field);

    let issues;
    if (cfSort && orderBy) {
      // Fetch a larger window unordered, sort in memory, then trim.
      const rows = await db.issue.findMany({
        where,
        include: issueInclude,
        take: 500,
      });
      const dtos = rows.map(toIssueDTO);
      dtos.sort((a, b) => {
        const cmp = compareCustom(a, b, cfSort.id, cfSort.type);
        return orderBy.dir === "desc" ? -cmp : cmp;
      });
      issues = dtos.slice(0, 100);
    } else {
      const primary = orderBy ? dbOrderBy(orderBy) : null;
      const order: Record<string, unknown>[] = [];
      if (primary) order.push(primary);
      if (!primary || !("updatedAt" in primary)) order.push({ updatedAt: "desc" });
      issues = await db.issue.findMany({
        where,
        include: issueInclude,
        orderBy: order,
        take: 100,
      });
      issues = issues.map(toIssueDTO);
    }

    return NextResponse.json({
      issues,
      parsed: query,
      error: null,
      sortedBy: orderBy?.field.replace(/^cf:/, "cf.") ?? null,
      sortedDir: orderBy?.dir ?? null,
    });
  });
}
