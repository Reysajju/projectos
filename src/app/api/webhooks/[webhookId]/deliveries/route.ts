import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toWebhookDeliveryDTO } from "@/lib/dto";
import { handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ webhookId: string }> };

/** GET — the webhook's last 25 deliveries. */
export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { webhookId } = await ctx.params;

    const hook = await db.webhook.findUnique({ where: { id: webhookId } });
    if (!hook || hook.orgId !== session.org.id) return notFound("Webhook not found");

    const deliveries = await db.webhookDelivery.findMany({
      where: { webhookId: hook.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({ deliveries: deliveries.map(toWebhookDeliveryDTO) });
  });
}
