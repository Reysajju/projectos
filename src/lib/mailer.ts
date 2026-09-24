/**
 * ProjectOS mail engine — Nodemailer SMTP (blueprint §34, production swap-in).
 *
 * Configuration (all via .env — a Gmail app password works out of the box):
 *   SMTP_HOST     e.g. smtp.gmail.com          (required to enable real sending)
 *   SMTP_PORT     e.g. 587                     (default 587; 465 with SMTP_SECURE=1)
 *   SMTP_USER     your account / address
 *   SMTP_PASS     the app password             (never logged, never returned)
 *   SMTP_SECURE   "1" for implicit TLS (465), omitted otherwise
 *   MAIL_FROM     "ProjectOS <you@company.com>" (defaults to SMTP_USER)
 *   APP_URL       public base URL used in email links (default http://localhost:3000)
 *
 * When SMTP_HOST is absent the engine stays fully functional in SIMULATION
 * mode: every message is rendered, logged to the EmailLog outbox with full
 * HTML + text, and flagged SIMULATED so the Digest view can preview exactly
 * what WOULD be delivered. Nothing in the request path ever blocks on SMTP.
 */

import { createHash, randomBytes } from "crypto";
import type { Transporter } from "nodemailer";
import { db } from "@/lib/db";
import {
  assignedEmail,
  commentEmail,
  statusChangedEmail,
  digestEmail,
  type EmailTemplate,
  type IssueCtx,
} from "@/lib/email-templates";

// ─── Configuration ──────────────────────────────────────────────

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  return "http://localhost:3000";
}

function fromAddress(): string {
  const user = process.env.SMTP_USER || "no-reply@projectos.local";
  return process.env.MAIL_FROM || `ProjectOS <${user}>`;
}

export interface SmtpStatus {
  configured: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  from: string;
  appUrl: string;
}

function isSmtpSecure(port: number): boolean {
  if (process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1") return true;
  if (process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0") return false;
  return port === 465;
}

export function smtpStatus(): SmtpStatus {
  const configured = !!process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  return {
    configured,
    host: process.env.SMTP_HOST ?? null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    secure: isSmtpSecure(port),
    user: process.env.SMTP_USER ?? null,
    from: fromAddress(),
    appUrl: appUrl(),
  };
}

// ─── Transport (lazy singleton) ─────────────────────────────────

let transporter: Transporter | null = null;

async function getTransport(): Promise<Transporter | null> {
  const st = smtpStatus();
  if (!st.configured) return null;
  if (transporter) return transporter;
  const nodemailer = await import("nodemailer");
  const createTransport =
    (nodemailer as any).createTransport ||
    (nodemailer as any).default?.createTransport;

  const rawPass = process.env.SMTP_PASS || "";
  // Strip whitespace if user copied Google App Password with spaces (e.g. "abcd efgh ijkl mnop")
  const cleanPass =
    rawPass.includes(" ") && rawPass.replace(/\s+/g, "").length === 16
      ? rawPass.replace(/\s+/g, "")
      : rawPass.trim();

  transporter = createTransport({
    host: st.host!,
    port: st.port ?? 587,
    secure: st.secure,
    auth: st.user ? { user: st.user.trim(), pass: cleanPass } : undefined,
    tls: {
      rejectUnauthorized: process.env.SMTP_IGNORE_TLS === "true" ? false : undefined,
    },
    // fail fast so request paths queueing emails never hang for minutes
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Verify SMTP credentials; used by the Settings "test email" flow. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const t = await getTransport();
    if (!t) return { ok: false, error: "SMTP_HOST is not configured in your environment variables" };
    await t.verify();
    return { ok: true };
  } catch (err) {
    transporter = null; // force reconnect on next attempt
    return { ok: false, error: err instanceof Error ? err.message : "SMTP verification failed" };
  }
}

// ─── Token machinery (claim / reset links) ──────────────────────

/** Create a single-use AuthToken and return the raw token (only time it exists). */
export async function createAuthToken(userId: string, purpose: "CLAIM" | "RESET", hours = 24): Promise<string> {
  const raw = randomBytes(24).toString("base64url");
  await db.authToken.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      purpose,
      expiresAt: new Date(Date.now() + hours * 3600 * 1000),
    },
  });
  return raw;
}

export async function consumeAuthToken(
  raw: string,
  purpose: "CLAIM" | "RESET"
): Promise<{ userId: string } | null> {
  const row = await db.authToken.findUnique({
    where: { tokenHash: createHash("sha256").update(raw).digest("hex") },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  await db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { userId: row.userId };
}

// ─── Per-user email preferences ─────────────────────────────────

export const EMAIL_PREF_KEYS = [
  { key: "email.assigned", label: "Issues assigned to me", description: "Someone hands you an issue." },
  { key: "email.status_changed", label: "Status changes on issues I follow", description: "Reporter + assignee are emailed when a state changes." },
  { key: "email.comment", label: "Comments & mentions", description: "New comments on issues you follow, and @mentions." },
  { key: "email.digest", label: "Daily & weekly digests", description: "Scheduled summary of your workload." },
] as const;

/** Preferences default to ON — absence of a row means the user wants emails. */
export async function isEmailKindEnabled(userId: string, kind: string): Promise<boolean> {
  const prefKey = kindToPrefKey(kind);
  if (!prefKey) return false; // kinds that never email
  const pref = await db.userPreference.findUnique({
    where: { userId_key: { userId, key: prefKey } },
  });
  if (!pref) return true;
  try {
    return JSON.parse(pref.value) !== false;
  } catch {
    return true;
  }
}

function kindToPrefKey(kind: string): string | null {
  switch (kind) {
    case "ASSIGNED": return "email.assigned";
    case "STATUS_CHANGED": return "email.status_changed";
    case "COMMENT":
    case "MENTIONED": return "email.comment";
    case "DAILY_DIGEST":
    case "WEEKLY_DIGEST": return "email.digest";
    case "INVITE":
    case "WELCOME":
    case "RESET":
    case "TEST": return null; // transactional — always sent
    default: return null;
  }
}

// ─── Delivery core ──────────────────────────────────────────────

export interface DeliverOpts {
  orgId: string;
  userId: string | null;
  toEmail: string;
  kind: string;
  subject: string;
  html: string;
  text: string;
  meta?: Record<string, unknown>;
  /** Skip the per-user preference gate (transactional emails). */
  transactional?: boolean;
}

export interface DeliverResult {
  logId: string;
  status: "SENT" | "FAILED" | "SIMULATED";
  error?: string;
}

/**
 * Render-agnostic delivery: tries the SMTP transport when configured,
 * always writes an auditable EmailLog row. Never throws.
 */
export async function deliverEmail(opts: DeliverOpts): Promise<DeliverResult> {
  const st = smtpStatus();

  // Preference gate for notification-type emails (not transactional ones).
  if (!opts.transactional && opts.userId) {
    const enabled = await isEmailKindEnabled(opts.userId, opts.kind);
    if (!enabled) {
      const row = await db.emailLog.create({
        data: {
          orgId: opts.orgId, userId: opts.userId, toEmail: opts.toEmail,
          kind: opts.kind, subject: opts.subject, body: opts.text, html: opts.html,
          status: "SIMULATED", error: null,
          meta: JSON.stringify({ ...opts.meta, skipped: "user preference" }),
        },
      });
      return { logId: row.id, status: "SIMULATED", error: "skipped (user preference)" };
    }
  }

  if (!st.configured) {
    // Simulation mode — auditable outbox, identical rendering.
    const row = await db.emailLog.create({
      data: {
        orgId: opts.orgId, userId: opts.userId, toEmail: opts.toEmail,
        kind: opts.kind, subject: opts.subject, body: opts.text, html: opts.html,
        status: "SIMULATED", error: null,
        meta: JSON.stringify({ ...opts.meta, simulated: true, reason: "SMTP not configured" }),
      },
    });
    return { logId: row.id, status: "SIMULATED" };
  }

  try {
    const t = await getTransport();
    if (!t) throw new Error("transport unavailable");
    await t.sendMail({
      from: st.from,
      to: opts.toEmail,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      headers: { "X-ProjectOS-Kind": opts.kind },
    });
    const row = await db.emailLog.create({
      data: {
        orgId: opts.orgId, userId: opts.userId, toEmail: opts.toEmail,
        kind: opts.kind, subject: opts.subject, body: opts.text, html: opts.html,
        status: "SENT", error: null,
        meta: JSON.stringify({ ...opts.meta, transport: "smtp" }),
      },
    });
    return { logId: row.id, status: "SENT" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown SMTP error";
    const row = await db.emailLog.create({
      data: {
        orgId: opts.orgId, userId: opts.userId, toEmail: opts.toEmail,
        kind: opts.kind, subject: opts.subject, body: opts.text, html: opts.html,
        status: "FAILED", error: message.slice(0, 500),
        meta: JSON.stringify({ ...opts.meta, transport: "smtp" }),
      },
    });
    transporter = null; // reconnect on next attempt
    return { logId: row.id, status: "FAILED", error: message };
  }
}

/** Fire-and-forget wrapper for request paths. */
export function queueEmail(opts: DeliverOpts): void {
  void deliverEmail(opts).catch(() => undefined);
}

// ─── Notification → email bridge ────────────────────────────────

const ISSUE_INCLUDE = {
  project: { select: { name: true } },
  status: { select: { name: true } },
  priority: { select: { name: true } },
} as const;

/**
 * Called from notify() for every in-app notification that also deserves an
 * email. Hydrates user + issue context, renders the right template, delivers.
 */
export async function sendNotificationEmail(opts: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  issueId?: string | null;
  /** Extra template inputs threaded by callers (e.g. status from → to). */
  emailCtx?: Record<string, string | null | undefined>;
}): Promise<void> {
  try {
    const kind = notificationKind(opts.type);
    if (!kind) return;

    const [user, org] = await Promise.all([
      db.user.findUnique({ where: { id: opts.userId }, select: { email: true, name: true } }),
      db.organization.findUnique({ where: { id: opts.orgId }, select: { name: true } }),
    ]);
    if (!user) return;

    let issue: (IssueCtx & { issueId: string }) | null = null;
    let issueFull: { statusName: string } | null = null;
    if (opts.issueId) {
      const row = await db.issue.findUnique({
        where: { id: opts.issueId },
        select: { id: true, key: true, summary: true, project: { select: { name: true } }, status: { select: { name: true } }, priority: { select: { name: true } } },
      });
      if (row) {
        issue = {
          issueId: row.id, key: row.key, title: row.summary,
          projectName: row.project.name, statusName: row.status.name,
          priorityName: row.priority?.name ?? null,
        };
        issueFull = { statusName: row.status.name };
      }
    }

    const base = { appUrl: appUrl(), orgName: org?.name ?? "your workspace" };
    let tpl: EmailTemplate;

    switch (kind) {
      case "ASSIGNED": {
        if (!issue) return;
        tpl = assignedEmail({
          ...base,
          actorName: opts.emailCtx?.actorName || extractActor(opts.body) || "A teammate",
          recipientName: user.name,
          issue,
        });
        break;
      }
      case "STATUS_CHANGED": {
        if (!issue) return;
        tpl = statusChangedEmail({
          ...base,
          actorName: opts.emailCtx?.actorName || extractActor(opts.body) || "A teammate",
          issue,
          from: opts.emailCtx?.from || "previous status",
          to: opts.emailCtx?.to || issueFull?.statusName || issue.statusName,
        });
        break;
      }
      case "COMMENT":
      case "MENTIONED": {
        if (!issue) return;
        tpl = commentEmail({
          ...base,
          actorName: opts.emailCtx?.actorName || extractActor(opts.body) || "A teammate",
          issue,
          commentText: opts.body ?? "",
          mentioned: kind === "MENTIONED",
        });
        break;
      }
      default:
        return;
    }

    await deliverEmail({
      orgId: opts.orgId,
      userId: opts.userId,
      toEmail: user.email,
      kind,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      meta: { notificationType: opts.type, issueKey: issue?.key ?? null },
    });
  } catch {
    // email must never break the notification path
  }
}

function notificationKind(type: string): string | null {
  switch (type) {
    case "assigned": return "ASSIGNED";
    case "status_changed": return "STATUS_CHANGED";
    case "comment": return "COMMENT";
    case "mentioned": return "MENTIONED";
    default: return null; // automation, sprint, due_soon → in-app only
  }
}

/** Notification bodies start with "<Actor Name>: ..." or "<Actor Name> ..." — best effort. */
function extractActor(body?: string | null): string | null {
  if (!body) return null;
  const m = body.match(/^([^:]{2,40}?):\s/);
  return m ? m[1] : null;
}

// ─── Digests (used by /api/digest + the cron mini-service) ──────

export async function sendDigestEmail(payload: {
  orgId: string; userId: string; toEmail: string; recipientName: string;
  periodLabel: string; kind: "DAILY" | "WEEKLY";
  sections: {
    id: string; title: string;
    items: { key: string; summary: string; projectName: string; statusName: string; statusColor: string; priorityName: string | null; dueDate: string | null }[];
  }[];
  counts: { assignedOpen: number; dueSoon: number; overdue: number; blocked: number; completed: number; openTotal: number };
  meta?: Record<string, unknown>;
}): Promise<DeliverResult> {
  const tpl = digestEmail({
    appUrl: appUrl(),
    recipientName: payload.recipientName,
    periodLabel: payload.periodLabel,
    kind: payload.kind,
    sections: payload.sections,
    counts: payload.counts,
  });
  return deliverEmail({
    orgId: payload.orgId,
    userId: payload.userId,
    toEmail: payload.toEmail,
    kind: payload.kind === "DAILY" ? "DAILY_DIGEST" : "WEEKLY_DIGEST",
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    meta: payload.meta,
  });
}
