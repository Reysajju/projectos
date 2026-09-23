import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toCustomFieldDTO } from "@/lib/dto";
import { ApiError, canManage, forbidden, handle, notFound, parseBody, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ fieldId: string }> };

/** Rename / reorder / set options for a custom field (ADMIN/MANAGER only). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage custom fields");
    const { fieldId } = await ctx.params;

    const field = await db.customField.findUnique({ where: { id: fieldId } });
    if (!field || field.orgId !== session.org.id) return notFound("Custom field not found");

    const body = await parseBody(req);
    const data: { name?: string; options?: string; order?: number } = {};

    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new ApiError("Field name is required", 400);
      if (name.length > 60) throw new ApiError("Field name is too long (max 60)", 400);
      const all = await db.customField.findMany({ where: { orgId: session.org.id } });
      if (all.some((f) => f.id !== field.id && f.name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError("A field with this name already exists", 409);
      }
      data.name = name;
    }
    if ("order" in body) {
      const n = Number(body.order);
      if (!Number.isFinite(n) || n < 0) throw new ApiError("Invalid order", 400);
      data.order = Math.round(n);
    }
    if ("options" in body && field.type === "SELECT") {
      const raw: unknown = body.options;
      if (!Array.isArray(raw)) throw new ApiError("Options must be a list", 400);
      const options = raw
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 30);
      if (options.length === 0) throw new ApiError("Add at least one option", 400);
      if (new Set(options).size !== options.length) throw new ApiError("Options must be unique", 400);
      data.options = JSON.stringify(options);
    }

    const updated = await db.customField.update({ where: { id: field.id }, data });
    return NextResponse.json({ field: toCustomFieldDTO(updated) });
  });
}

/** Delete a custom field definition. Stored issue values become orphans (ignored everywhere). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage custom fields");
    const { fieldId } = await ctx.params;

    const field = await db.customField.findUnique({ where: { id: fieldId } });
    if (!field || field.orgId !== session.org.id) return notFound("Custom field not found");

    await db.customField.delete({ where: { id: field.id } });
    return NextResponse.json({});
  });
}
