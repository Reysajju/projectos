import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ApiError, canWrite, handle, notFound, parseBody, unauthorized } from "@/lib/api-helpers";
import { AUTOMATION_TRIGGERS } from "@/lib/automation";

export const dynamic = "force-dynamic";

/** PATCH /api/automations/[ruleId] — update name/trigger/conditions/actions/enabled. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) throw new ApiError("Viewers cannot edit automations", 403);
    const { ruleId } = await params;

    const rule = await db.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.orgId !== session.org.id) return notFound("Automation not found");

    const body = await parseBody(req);
    const data: {
      name?: string; trigger?: string; conditions?: string; actions?: string; enabled?: boolean;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if ("trigger" in body) {
      const trigger = String(body.trigger);
      if (!AUTOMATION_TRIGGERS.some((t) => t.value === trigger)) throw new ApiError("Invalid trigger", 400);
      data.trigger = trigger;
    }
    if (Array.isArray(body.conditions)) data.conditions = JSON.stringify(body.conditions);
    if (Array.isArray(body.actions)) {
      if (!body.actions.length) throw new ApiError("Add at least one action", 400);
      data.actions = JSON.stringify(body.actions);
    }

    const updated = await db.automationRule.update({
      where: { id: ruleId },
      data,
      include: { creator: { select: { id: true, name: true, avatarColor: true } } },
    });

    return NextResponse.json({
      rule: {
        id: updated.id,
        name: updated.name,
        trigger: updated.trigger,
        conditions: JSON.parse(updated.conditions) as unknown[],
        actions: JSON.parse(updated.actions) as unknown[],
        enabled: updated.enabled,
        runCount: updated.runCount,
        lastRunAt: updated.lastRunAt?.toISOString() ?? null,
        lastRunResult: updated.lastRunResult,
        creator: updated.creator,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  });
}

/** DELETE /api/automations/[ruleId] — creator or ADMIN only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canWrite(session.role)) throw new ApiError("Viewers cannot delete automations", 403);
    const { ruleId } = await params;

    const rule = await db.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.orgId !== session.org.id) return notFound("Automation not found");
    if (rule.createdBy !== session.user.id && session.role !== "ADMIN") {
      throw new ApiError("Only the rule creator or an admin can delete it", 403);
    }

    await db.automationRule.delete({ where: { id: ruleId } });
    return NextResponse.json({});
  });
}
