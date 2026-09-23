/**
 * Webhooks engine (blueprint §38) — signed, fire-and-forget deliveries with
 * a persisted delivery log.
 *
 * Envelope: { id, event, timestamp, org, actor, data }
 * Signing:  X-Signature: sha256=<HMAC-SHA256(secret, rawBody)>
 *           X-ProjectOS-Event: <event>
 *           X-ProjectOS-Delivery: <deliveryId>
 *
 * Delivery is fire-and-forget: failures are recorded on the delivery row and
 * NEVER propagate into the request path. Each webhook keeps its last 50
 * deliveries (older rows pruned).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const WEBHOOK_EVENTS = [
  "issue.created",
  "issue.updated",
  "issue.deleted",
  "issue.status_changed",
  "comment.created",
  "sprint.completed",
  "ping",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const TIMEOUT_MS = 5_000;
const KEEP_DELIVERIES = 50;

export function parseEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Constant-time signature check (used by the built-in test receiver). */
export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = signPayload(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string;
}

async function deliver(
  hook: WebhookRow,
  event: WebhookEvent,
  payload: unknown
): Promise<{ status: "SUCCESS" | "FAILED"; responseCode: number | null; durationMs: number; error: string | null }> {
  const body = JSON.stringify(payload);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ProjectOS-Webhooks/1.0",
        "X-Signature": signPayload(hook.secret, body),
        "X-ProjectOS-Event": event,
        "X-ProjectOS-Delivery": randomBytes(12).toString("hex"),
      },
      body,
      signal: controller.signal,
    });
    return {
      status: res.ok ? "SUCCESS" : "FAILED",
      responseCode: res.status,
      durationMs: Date.now() - started,
      error: res.ok ? null : `Receiver responded ${res.status}`,
    };
  } catch (err) {
    return {
      status: "FAILED",
      responseCode: null,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message.slice(0, 300) : "Delivery failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fan an event out to every active webhook of the org subscribed to it.
 * Fire-and-forget safe — never throws into the caller.
 */
export async function fireWebhooks(
  event: WebhookEvent,
  ctx: { orgId: string; actor: { id: string; name: string }; data: unknown }
): Promise<void> {
  try {
    const hooks = await db.webhook.findMany({ where: { orgId: ctx.orgId, active: true } });
    if (!hooks.length) return;

    const envelope = {
      id: `evt_${randomBytes(10).toString("hex")}`,
      event,
      timestamp: new Date().toISOString(),
      org: ctx.orgId,
      actor: ctx.actor,
      data: ctx.data,
    };

    for (const hook of hooks) {
      if (!parseEvents(hook.events).includes(event)) continue;
      const result = await deliver(hook as WebhookRow, event, envelope);
      try {
        await db.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event,
            status: result.status,
            responseCode: result.responseCode,
            durationMs: result.durationMs,
            error: result.error,
            payload: JSON.stringify(envelope).slice(0, 8000),
          },
        });
        // prune old deliveries beyond the retention window
        const old = await db.webhookDelivery.findMany({
          where: { webhookId: hook.id },
          orderBy: { createdAt: "desc" },
          skip: KEEP_DELIVERIES,
          take: KEEP_DELIVERIES,
          select: { id: true },
        });
        if (old.length) {
          await db.webhookDelivery.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
        }
      } catch {
        // logging must never break delivery or the request
      }
    }
  } catch {
    // webhooks must never break the request path
  }
}

/**
 * Synchronous single-webhook delivery used by the "Send test" button so the
 * UI can show the response code immediately. Also records the delivery row.
 */
export async function sendTestDelivery(
  hook: WebhookRow
): Promise<{ status: "SUCCESS" | "FAILED"; responseCode: number | null; durationMs: number; error: string | null }> {
  const envelope = {
    id: `evt_${randomBytes(10).toString("hex")}`,
    event: "ping" as const,
    timestamp: new Date().toISOString(),
    org: null,
    actor: null,
    data: { message: "Test delivery from ProjectOS", note: "This is a manually triggered ping." },
  };
  const result = await deliver(hook, "ping", envelope);
  try {
    await db.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: "ping",
        status: result.status,
        responseCode: result.responseCode,
        durationMs: result.durationMs,
        error: result.error,
        payload: JSON.stringify(envelope).slice(0, 8000),
      },
    });
  } catch {
    // ignore logging failures
  }
  return result;
}
