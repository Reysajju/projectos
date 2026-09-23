import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, handle, parseBody, reqStr, optStr, unauthorized, forbidden } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"];
const STATUS_COLORS = [
  "#78716c", "#d97706", "#059669", "#7c3aed", "#dc2626", "#0891b2",
  "#c2410c", "#4d7c0f", "#be185d", "#4338ca",
];

/** POST /api/statuses — create a new workflow status { name, category, color? }. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") return forbidden("Only admins and managers can edit the workflow");
    const orgId = session.org.id;

    const body = await parseBody(req);
    const name = reqStr(body, "name").trim();
    const category = reqStr(body, "category");
    if (!name) throw new ApiError("Name is required", 400);
    if (name.length > 40) throw new ApiError("Name must be 40 characters or fewer", 400);
    if (!CATEGORIES.includes(category)) {
      throw new ApiError("Category must be TODO, IN_PROGRESS or DONE", 400);
    }
    const color = (optStr(body, "color") || STATUS_COLORS[Math.floor(Math.random() * STATUS_COLORS.length)]).trim();

    // Case-insensitive uniqueness (SQLite connector has no insensitive mode)
    const all = await db.status.findMany({ where: { orgId }, select: { name: true } });
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(`A status named "${name}" already exists`, 409);
    }

    const maxOrder = await db.status.aggregate({ where: { orgId }, _max: { order: true } });
    const status = await db.status.create({
      data: { orgId, name, category, color, order: (maxOrder._max.order ?? 0) + 1 },
    });

    return NextResponse.json({ status: { ...status, issueCount: 0 } });
  });
}
