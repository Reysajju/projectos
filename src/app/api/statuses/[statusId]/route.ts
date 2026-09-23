import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, handle, parseBody, optStr, unauthorized, forbidden, notFound } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"];

/**
 * PATCH /api/statuses/[statusId] — { name?, category?, color?, isInitial?, order? }.
 * Setting isInitial on one status clears it on all others (single initial status).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ statusId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") return forbidden("Only admins and managers can edit the workflow");
    const orgId = session.org.id;
    const { statusId } = await params;

    const status = await db.status.findFirst({ where: { id: statusId, orgId } });
    if (!status) return notFound();

    const body = await parseBody(req);
    const data: { name?: string; category?: string; color?: string; isInitial?: boolean; order?: number } = {};

    const name = optStr(body, "name");
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) throw new ApiError("Name cannot be empty", 400);
      if (trimmed.length > 40) throw new ApiError("Name must be 40 characters or fewer", 400);
      if (trimmed.toLowerCase() !== status.name.toLowerCase()) {
        // Case-insensitive uniqueness (SQLite connector has no insensitive mode)
        const all = await db.status.findMany({ where: { orgId }, select: { name: true } });
        if (all.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
          throw new ApiError(`A status named "${trimmed}" already exists`, 409);
        }
      }
      data.name = trimmed;
    }

    const category = optStr(body, "category");
    if (category !== undefined) {
      if (!CATEGORIES.includes(category)) throw new ApiError("Category must be TODO, IN_PROGRESS or DONE", 400);
      data.category = category;
    }

    const color = optStr(body, "color");
    if (color !== undefined) data.color = color.trim();

    if (body && typeof body.isInitial === "boolean") data.isInitial = body.isInitial;

    const order = typeof body.order === "number" ? Math.round(body.order) : undefined;
    if (order !== undefined) data.order = order;

    const updated = await db.$transaction(async (tx) => {
      if (data.isInitial === true) {
        await tx.status.updateMany({ where: { orgId, NOT: { id: statusId } }, data: { isInitial: false } });
      }
      return tx.status.update({ where: { id: statusId }, data });
    });

    return NextResponse.json({ status: updated });
  });
}

/**
 * DELETE /api/statuses/[statusId] — deletes the status. Issues currently in it
 * are moved to the target status (?moveTo=<statusId>) or, when omitted, to the
 * org's initial/first status. All transitions touching it are removed by cascade.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ statusId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") return forbidden("Only admins and managers can edit the workflow");
    const orgId = session.org.id;
    const { statusId } = await params;

    const status = await db.status.findFirst({ where: { id: statusId, orgId } });
    if (!status) return notFound();

    const total = await db.status.count({ where: { orgId } });
    if (total <= 1) throw new ApiError("Cannot delete the last status in the workspace", 400);

    const url = new URL(req.url);
    const moveToId = url.searchParams.get("moveTo");
    let target = moveToId
      ? await db.status.findFirst({ where: { id: moveToId, orgId } })
      : null;
    if (moveToId && !target) throw new ApiError("Target status must exist in this workspace", 400);
    if (!target || target.id === statusId) {
      target =
        (await db.status.findFirst({ where: { orgId, isInitial: true, NOT: { id: statusId } } })) ??
        (await db.status.findFirst({ where: { orgId, NOT: { id: statusId } }, orderBy: { order: "asc" } }));
    }
    if (!target) throw new ApiError("No other status available to move issues to", 400);

    await db.$transaction(async (tx) => {
      await tx.issue.updateMany({ where: { statusId, orgId }, data: { statusId: target!.id } });
      await tx.status.delete({ where: { id: statusId } });
      // Keep exactly one initial status in the org at all times.
      const initialLeft = await tx.status.findFirst({ where: { orgId, isInitial: true } });
      if (!initialLeft) {
        await tx.status.update({ where: { id: target.id }, data: { isInitial: true } });
      }
    });

    return NextResponse.json({ movedTo: target.id });
  });
}
