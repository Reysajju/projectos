import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { WEBHOOK_EVENTS, generateSecret } from "@/lib/webhooks";
import { toWebhookDTO } from "@/lib/dto";
import {
  ApiError,
  canManage,
  forbidden,
  handle,
  optStr,
  parseBody,
  reqStr,
  unauthorized,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET — list org webhooks with aggregated delivery stats. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const hooks = await db.webhook.findMany({
      where: { orgId: session.org.id },
      include: { creator: true, deliveries: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ webhooks: hooks.map(toWebhookDTO) });
  });
}

/** POST — register a webhook. ADMIN/MANAGER only. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) return forbidden("Only admins and managers can manage webhooks");

    const body = await parseBody(req);
    const url = reqStr(body, "url");
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
      throw new ApiError("URL must be a valid http(s) endpoint", 400);
    }

    const events = Array.isArray(body.events)
      ? body.events.filter((e): e is string => typeof e === "string")
      : [];
    if (!events.length) throw new ApiError("Select at least one event", 400);
    const valid = events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e) && e !== "ping");
    if (!valid.length) throw new ApiError(`Unknown events. Valid: ${WEBHOOK_EVENTS.filter((e) => e !== "ping").join(", ")}`, 400);
    if (valid.length !== events.length) throw new ApiError("Unknown event in list", 400);

    const description = optStr(body, "description");

    const hook = await db.webhook.create({
      data: {
        orgId: session.org.id,
        url,
        events: JSON.stringify(valid),
        secret: generateSecret(),
        description: description?.trim() || null,
        active: true,
        createdBy: session.user.id,
      },
      include: { creator: true, deliveries: { orderBy: { createdAt: "desc" }, take: 10 } },
    });

    // surface the secret exactly once at creation time
    return NextResponse.json({ webhook: toWebhookDTO(hook), secret: hook.secret }, { status: 201 });
  });
}
