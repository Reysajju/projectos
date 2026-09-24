import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { sendNotificationEmail } from "@/lib/mailer";

// ─── Workflow engine: the ONLY sanctioned way to change issue status ──

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function logActivity(opts: {
  orgId: string;
  userId: string;
  issueId?: string | null;
  projectId?: string | null;
  type: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await db.activity.create({
    data: {
      orgId: opts.orgId,
      userId: opts.userId,
      issueId: opts.issueId ?? null,
      projectId: opts.projectId ?? null,
      type: opts.type,
      field: opts.field ?? null,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
    },
  });
}

/**
 * Create an in-app notification AND (fire-and-forget) the matching email.
 * Email delivery respects per-user preferences (Settings → Email notifications)
 * and degrades to the auditable outbox when SMTP is not configured.
 */
export async function notify(opts: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  issueId?: string | null;
  emailCtx?: Record<string, string | null | undefined>;
}) {
  if (!opts.userId) return;
  await db.notification.create({
    data: {
      orgId: opts.orgId,
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      issueId: opts.issueId ?? null,
    },
  });
  await sendNotificationEmail({
    orgId: opts.orgId,
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    issueId: opts.issueId,
    emailCtx: opts.emailCtx,
  });
}

export function userLabel(u: Pick<User, "name"> | null | undefined) {
  return u ? u.name : "Someone";
}

/**
 * Transition an issue to a new status through the workflow engine.
 * Validates: status belongs to same org; transition is allowed by the
 * org's workflow graph (if the org has defined any transitions — an org
 * with zero transitions runs an open workflow where every move is legal).
 * Fires activity + notifications.
 */
export async function transitionIssue(params: {
  issueId: string;
  newStatusId: string;
  actor: User;
}) {
  const issue = await db.issue.findUnique({
    where: { id: params.issueId },
    include: { status: true, reporter: true, assignee: true, project: true },
  });
  if (!issue) throw new WorkflowError("Issue not found", 404);

  const newStatus = await db.status.findUnique({ where: { id: params.newStatusId } });
  if (!newStatus || newStatus.orgId !== issue.orgId) {
    throw new WorkflowError("Invalid status for this workspace", 400);
  }
  if (newStatus.id === issue.statusId) return issue; // no-op

  // Workflow graph enforcement: only when the org has at least one
  // explicit transition do we restrict moves.
  const anyTransition = await db.workflowTransition.findFirst({
    where: { orgId: issue.orgId },
    select: { id: true },
  });
  if (anyTransition) {
    const edge = await db.workflowTransition.findUnique({
      where: {
        orgId_fromStatusId_toStatusId: {
          orgId: issue.orgId,
          fromStatusId: issue.statusId,
          toStatusId: newStatus.id,
        },
      },
      select: { id: true },
    });
    if (!edge) {
      throw new WorkflowError(
        `Workflow does not allow moving from "${issue.status.name}" to "${newStatus.name}"`,
        400
      );
    }
  }

  const updated = await db.issue.update({
    where: { id: issue.id },
    data: { statusId: newStatus.id },
  });

  await logActivity({
    orgId: issue.orgId,
    userId: params.actor.id,
    issueId: issue.id,
    projectId: issue.projectId,
    type: "issue.status_changed",
    field: "status",
    oldValue: issue.status.name,
    newValue: newStatus.name,
  });

  const notified = new Set<string>([params.actor.id]);
  const targets = [issue.reporterId, issue.assigneeId].filter(Boolean) as string[];
  for (const uid of targets) {
    if (notified.has(uid)) continue;
    notified.add(uid);
    await notify({
      orgId: issue.orgId,
      userId: uid,
      type: "status_changed",
      title: `${issue.key} moved to ${newStatus.name}`,
      body: `${params.actor.name} changed status: ${issue.status.name} → ${newStatus.name}`,
      issueId: issue.id,
      emailCtx: {
        actorName: params.actor.name,
        from: issue.status.name,
        to: newStatus.name,
      },
    });
  }

  return updated;
}

// ─── Automation engine (event-driven, v1 inline rules) ──────────

export function parseMentions(body: string): string[] {
  // Mentions are written as @Full Name; we return the raw names.
  const re = /@([\p{L}\p{N} ._-]+)/gu;
  const names: string[] = [];
  for (const m of body.matchAll(re)) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

export async function notifyMentions(params: {
  orgId: string;
  issueId: string;
  issueKey: string;
  body: string;
  actor: User;
  members: { userId: string; user: { name: string } }[];
}) {
  const names = parseMentions(params.body);
  if (!names.length) return;
  for (const m of params.members) {
    const matched = names.some(
      (n) =>
        m.user.name.toLowerCase() === n.toLowerCase() ||
        m.user.name.toLowerCase().startsWith(n.toLowerCase())
    );
    if (matched) {
      await notify({
        orgId: params.orgId,
        userId: m.userId,
        type: "mentioned",
        title: `You were mentioned in ${params.issueKey}`,
        body: `${params.actor.name}: ${params.body.slice(0, 120)}`,
        issueId: params.issueId,
        emailCtx: { actorName: params.actor.name },
      });
    }
  }
}
