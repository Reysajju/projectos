import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueInclude, toIssueDTO, toProjectDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Org-scoped search. SQLite `contains` is case-insensitive for ASCII,
 * so plain `contains` gives us the required case-insensitive matching.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ issues: [], projects: [] });
    const orgId = session.org.id;

    const [issues, projects] = await Promise.all([
      db.issue.findMany({
        where: {
          orgId,
          OR: [
            { key: { contains: q } },
            { summary: { contains: q } },
            { description: { contains: q } },
          ],
        },
        include: issueInclude,
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
      db.project.findMany({
        where: { orgId, OR: [{ key: { contains: q } }, { name: { contains: q } }] },
        include: { lead: true, _count: { select: { issues: true } } },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      issues: issues.map(toIssueDTO),
      projects: projects.map(toProjectDTO),
    });
  });
}
