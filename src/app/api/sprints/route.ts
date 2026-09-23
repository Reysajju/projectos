import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toSprintDTO } from "@/lib/dto";
import {
  canWrite,
  forbidden,
  handle,
  notFound,
  optDateOrNull,
  optStrOrNull,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) return forbidden("Viewers cannot make changes");
    const body = await parseBody(req);

    const projectId = reqStr(body, "projectId");
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project || project.orgId !== session.org.id) return notFound("Project not found");

    const name = reqStr(body, "name");
    const goal = optStrOrNull(body, "goal") ?? null;
    const startDate = optDateOrNull(body, "startDate") ?? null;
    const endDate = optDateOrNull(body, "endDate") ?? null;

    const max = await db.sprint.aggregate({
      where: { projectId: project.id },
      _max: { order: true },
    });

    const sprint = await db.sprint.create({
      data: {
        projectId: project.id,
        name,
        goal,
        startDate,
        endDate,
        status: "FUTURE",
        order: (max._max.order ?? 0) + 1,
      },
    });

    return NextResponse.json(toSprintDTO(sprint));
  });
}
