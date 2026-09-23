import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/workflow";
import { toProjectDTO } from "@/lib/dto";
import {
  ApiError,
  canWrite,
  forbidden,
  handle,
  idOrNull,
  jsonError,
  optStr,
  optStrOrNull,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const projects = await db.project.findMany({
      where: { orgId: session.org.id },
      include: { lead: true, _count: { select: { issues: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ projects: projects.map(toProjectDTO) });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const body = await parseBody(req);
    const orgId = session.org.id;

    const name = reqStr(body, "name");
    const key = reqStr(body, "key").toUpperCase();
    if (!KEY_RE.test(key)) {
      throw new ApiError("Project key must be 2-10 uppercase letters/numbers (e.g. WEB)", 400);
    }
    const description = optStrOrNull(body, "description") ?? null;
    const color = optStr(body, "color") || "#d97706";
    const icon = optStr(body, "icon") || "rocket";
    const leadId = idOrNull(body, "leadId") ?? null;
    if (leadId) {
      const leadMember = await db.organizationMember.findFirst({ where: { orgId, userId: leadId } });
      if (!leadMember) throw new ApiError("Lead must be a workspace member", 400);
    }

    const dup = await db.project.findFirst({ where: { orgId, key } });
    if (dup) return jsonError("A project with this key already exists", 409);

    const project = await db.project.create({
      data: { orgId, key, name, description, color, icon, leadId },
      include: { lead: true, _count: { select: { issues: true } } },
    });

    await logActivity({
      orgId,
      userId: session.user.id,
      projectId: project.id,
      type: "project.created",
      newValue: project.name,
    });

    return NextResponse.json(toProjectDTO(project));
  });
}
