import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toCustomFieldDTO } from "@/lib/dto";
import { ApiError, canManage, forbidden, handle, parseBody, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"] as const;

/** List org-wide custom field definitions. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const fields = await db.customField.findMany({
      where: { orgId: session.org.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ fields: fields.map(toCustomFieldDTO) });
  });
}

/** Create a custom field definition (ADMIN/MANAGER only). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage custom fields");
    const body = await parseBody(req);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError("Field name is required", 400);
    if (name.length > 60) throw new ApiError("Field name is too long (max 60)", 400);
    const type = typeof body.type === "string" ? body.type : "";
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      throw new ApiError("Invalid field type", 400);
    }

    let options: string[] = [];
    if (type === "SELECT") {
      const raw: unknown = body.options;
      if (!Array.isArray(raw)) throw new ApiError("SELECT fields need an options list", 400);
      options = raw
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 30);
      if (options.length === 0) throw new ApiError("Add at least one option", 400);
      if (new Set(options).size !== options.length) throw new ApiError("Options must be unique", 400);
    }

    const existing = await db.customField.findMany({ where: { orgId: session.org.id } });
    if (existing.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError("A field with this name already exists", 409);
    }

    const field = await db.customField.create({
      data: {
        orgId: session.org.id,
        name,
        type,
        options: type === "SELECT" ? JSON.stringify(options) : null,
        order: existing.length,
      },
    });
    return NextResponse.json({ field: toCustomFieldDTO(field) });
  });
}
