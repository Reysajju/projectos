import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { toWebhookDTO } from "@/lib/dto";
import {
  ApiError,
  canManage,
  forbidden,
  handle,
  notFound,
  optStr,
  parseBody,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ webhookId: string }> };

/** PATCH — update url / events / description / active toggle. ADMIN/MANAGER. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage webhooks");
    const { webhookId } = await ctx.params;
    const body = await parseBody(req);

    const hook = await db.webhook.findUnique({ where: { id: webhookId } });
    if (!hook || hook.orgId !== session.org.id) return notFound("Webhook not found");

    const data: { url?: string; events?: string; description?: string | null; active?: boolean } = {};

    if ("url" in body) {
      const url = optStr(body, "url") ?? "";
      if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
        throw new ApiError("URL must be a valid http(s) endpoint", 400);
      }
      data.url = url;
    }
    if ("events" in body) {
      const events = Array.isArray(body.events)
        ? body.events.filter((e): e is string => typeof e === "string")
        : [];
      if (!events.length) throw new ApiError("Select at least one event", 400);
      const valid = events.filter(
        (e) => (WEBHOOK_EVENTS as readonly string[]).includes(e) && e !== "ping"
      );
      if (valid.length !== events.length) throw new ApiError("Unknown event in list", 400);
      data.events = JSON.stringify(valid);
    }
    if ("description" in body) {
      const description = optStr(body, "description");
      data.description = description?.trim() || null;
    }
    if (typeof body.active === "boolean") {
      data.active = body.active;
    }

    const updated = await db.webhook.update({
      where: { id: hook.id },
      data,
      include: { creator: true, deliveries: { orderBy: { createdAt: "desc" }, take: 10 } },
    });

    return NextResponse.json({ webhook: toWebhookDTO(updated) });
  });
}

/** DELETE — remove the webhook and its delivery log (cascade). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage webhooks");
    const { webhookId } = await ctx.params;

    const hook = await db.webhook.findUnique({ where: { id: webhookId } });
    if (!hook || hook.orgId !== session.org.id) return notFound("Webhook not found");

    await db.webhook.delete({ where: { id: hook.id } });
    return NextResponse.json({});
  });
}
