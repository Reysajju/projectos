import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";
import { JqlError, parseJql } from "@/lib/jql";
import { ApiError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET /api/filters — saved filters for the org (all members see them). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const filters = await db.savedFilter.findMany({
      where: { orgId: session.org.id },
      include: { owner: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      filters: filters.map((f) => ({
        id: f.id,
        name: f.name,
        query: f.query,
        createdAt: f.createdAt.toISOString(),
        owner: { id: f.owner.id, name: f.owner.name, avatarColor: f.owner.avatarColor },
      })),
    });
  });
}

/** POST /api/filters — save a JQL filter. Body: { name, query } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const body = await parseBody(req);
    const name = reqStr(body, "name").slice(0, 80);
    const query = reqStr(body, "query").slice(0, 1000);

    try {
      parseJql(query); // validate before saving
    } catch (err) {
      if (err instanceof JqlError) throw new ApiError(`Invalid query: ${err.message}`, 400);
      throw err;
    }

    const created = await db.savedFilter.create({
      data: { orgId: session.org.id, name, query, ownerId: session.user.id },
    });
    return NextResponse.json({
      filter: {
        id: created.id,
        name: created.name,
        query: created.query,
        createdAt: created.createdAt.toISOString(),
        owner: { id: session.user.id, name: session.user.name, avatarColor: session.user.avatarColor },
      },
    });
  });
}
