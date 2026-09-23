import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, canWrite, handle, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";
import { AUTOMATION_TRIGGERS } from "@/lib/automation";

export const dynamic = "force-dynamic";

function ruleDTO(rule: {
  id: string; name: string; trigger: string; conditions: string; actions: string;
  enabled: boolean; runCount: number; lastRunAt: Date | null; lastRunResult: string | null;
  creator: { id: string; name: string; avatarColor: string };
  createdAt: Date;
}) {
  return {
    id: rule.id,
    name: rule.name,
    trigger: rule.trigger,
    conditions: JSON.parse(rule.conditions) as unknown[],
    actions: JSON.parse(rule.actions) as unknown[],
    enabled: rule.enabled,
    runCount: rule.runCount,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastRunResult: rule.lastRunResult,
    creator: rule.creator,
    createdAt: rule.createdAt.toISOString(),
  };
}

/** GET /api/automations — list rules for the org. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const rules = await db.automationRule.findMany({
      where: { orgId: session.org.id },
      include: { creator: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ rules: rules.map(ruleDTO) });
  });
}

/** POST /api/automations — create a rule. Body: { name, trigger, conditions[], actions[] } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) throw new ApiError("Viewers cannot create automations", 403);

    const body = await parseBody(req);
    const name = reqStr(body, "name").slice(0, 80);
    const trigger = reqStr(body, "trigger");
    if (!AUTOMATION_TRIGGERS.some((t) => t.value === trigger)) {
      throw new ApiError("Invalid trigger", 400);
    }
    const conditions = Array.isArray(body.conditions) ? body.conditions : [];
    const actions = Array.isArray(body.actions) ? body.actions : [];
    if (!actions.length) throw new ApiError("Add at least one action", 400);

    const created = await db.automationRule.create({
      data: {
        orgId: session.org.id,
        name,
        trigger,
        conditions: JSON.stringify(conditions),
        actions: JSON.stringify(actions),
        createdBy: session.user.id,
      },
      include: { creator: { select: { id: true, name: true, avatarColor: true } } },
    });
    return NextResponse.json({ rule: ruleDTO(created) });
  });
}
