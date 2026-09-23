/**
 * Built-in webhook test receiver (demo/dev helper).
 *
 * POST /api/webhook-receiver   — accepts any ProjectOS delivery, verifies the
 *                                HMAC signature when the delivery belongs to a
 *                                registered webhook, records the ping, and
 *                                answers 200 so local end-to-end flows work.
 * GET  /api/webhook-receiver   — the last received pings (for the UI log).
 *
 * This endpoint is intentionally unauthenticated: webhook receivers in the
 * wild have no ProjectOS session — they rely on the X-Signature header.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySignature } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

interface ReceivedPing {
  id: string;
  at: string;
  event: string | null;
  verified: boolean;
  signatureHeader: string | null;
  body: unknown;
}

// Module-level ring buffer (dev/demo scope — resets on server restart).
const RECEIVED: ReceivedPing[] = [];
const MAX_RECEIVED = 20;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  const event = req.headers.get("x-projectos-event");
  const deliveryId = req.headers.get("x-projectos-delivery");

  // Try to verify against a registered webhook secret.
  let verified = false;
  let parsedBody: unknown = null;
  try {
    parsedBody = JSON.parse(raw) as unknown;
  } catch {
    parsedBody = raw;
  }

  if (signature && parsedBody && typeof parsedBody === "object" && "id" in parsedBody) {
    const hooks = await db.webhook.findMany({
      where: { active: true },
      select: { id: true, secret: true },
    });
    // The receiver is org-agnostic; check every active hook's secret against
    // the signature (sandbox demo scale — a handful of rows at most).
    for (const hook of hooks) {
      if (verifySignature(hook.secret, raw, signature)) {
        verified = true;
        break;
      }
    }
  }

  RECEIVED.unshift({
    id: deliveryId ?? `local_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    event,
    verified,
    signatureHeader: signature,
    body: parsedBody,
  });
  if (RECEIVED.length > MAX_RECEIVED) RECEIVED.length = MAX_RECEIVED;

  return NextResponse.json({ ok: true, verified, receivedAt: new Date().toISOString() });
}

export async function GET() {
  return NextResponse.json({ pings: RECEIVED });
}
