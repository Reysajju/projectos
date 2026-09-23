/**
 * Email digest engine (blueprint §34).
 *
 * Builds a per-user work digest (daily / weekly) from live data and renders a
 * plain-text email body. In the sandbox there is no SMTP provider — "sending"
 * records a SIMULATED row in the EmailLog outbox, auditable in the Digest view.
 * Swapping in a real provider means flipping sendEmail() to enqueue + deliver.
 */

import { db } from "@/lib/db";

export type DigestKind = "DAILY" | "WEEKLY";

export interface DigestItem {
  key: string;
  summary: string;
  projectName: string;
  statusName: string;
  statusColor: string;
  priorityName: string | null;
  dueDate: string | null;
}

export interface DigestSection {
  id: "assigned" | "due-soon" | "overdue" | "blocked" | "completed";
  title: string;
  items: DigestItem[];
}

export interface DigestPayload {
  kind: DigestKind;
  periodLabel: string;
  recipientName: string;
  subject: string;
  sections: DigestSection[];
  counts: {
    assignedOpen: number;
    dueSoon: number;
    overdue: number;
    blocked: number;
    completed: number;
    openTotal: number;
  };
  text: string;
}

const digestInclude = {
  project: true,
  type: true,
  status: true,
  priority: true,
} as const;

function fmtDay(v: Date | string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtDayShort(v: Date | string | null): string {
  if (!v) return "";
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Build the full digest for one org member. */
export async function buildDigest(orgId: string, userId: string, kind: DigestKind): Promise<DigestPayload> {
  const now = new Date();
  const since = new Date(now.getTime() - (kind === "DAILY" ? 1 : 7) * 24 * 3600 * 1000);
  const soon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const recipientName = user?.name ?? "there";

  const [mine, dueSoonList, overdueList, blockedList, completedList, openTotal] = await Promise.all([
    db.issue.findMany({
      where: { orgId, assigneeId: userId, status: { category: { not: "DONE" } } },
      include: digestInclude,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    db.issue.findMany({
      where: {
        orgId,
        status: { category: { not: "DONE" } },
        dueDate: { gte: startOfToday, lte: soon },
        OR: [{ assigneeId: userId }, { reporterId: userId }],
      },
      include: digestInclude,
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.issue.findMany({
      where: {
        orgId,
        status: { category: { not: "DONE" } },
        dueDate: { lt: startOfToday },
        OR: [{ assigneeId: userId }, { reporterId: userId }],
      },
      include: digestInclude,
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.issue.findMany({
      where: {
        orgId,
        assigneeId: userId,
        status: { category: { not: "DONE" } },
        linksTo: {
          some: { type: "BLOCKS", source: { status: { category: { not: "DONE" } } } },
        },
      },
      include: { ...digestInclude, linksTo: { include: { source: { include: { status: true } } } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.issue.findMany({
      where: { orgId, status: { category: "DONE" }, updatedAt: { gte: since } },
      include: digestInclude,
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.issue.count({ where: { orgId, status: { category: { not: "DONE" } } } }),
  ]);

  const toItem = (i: (typeof mine)[number] & { linksTo?: { source: { key: string; status: { name: string } } }[] }): DigestItem => ({
    key: i.key,
    summary: i.summary,
    projectName: i.project.name,
    statusName: i.status.name,
    statusColor: i.status.color,
    priorityName: i.priority?.name ?? null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
  });

  const sections: DigestSection[] = [
    { id: "overdue", title: "Overdue — needs attention", items: overdueList.map(toItem) },
    { id: "blocked", title: "Blocked by an unfinished issue", items: blockedList.map((i) => toItem(i)) },
    { id: "due-soon", title: "Due in the next 7 days", items: dueSoonList.map(toItem) },
    { id: "assigned", title: "Open and assigned to you", items: mine.map(toItem) },
    { id: "completed", title: `Completed ${kind === "DAILY" ? "yesterday" : "this week"}`, items: completedList.map(toItem) },
  ];

  const counts = {
    assignedOpen: mine.length,
    dueSoon: dueSoonList.length,
    overdue: overdueList.length,
    blocked: blockedList.length,
    completed: completedList.length,
    openTotal,
  };

  const periodLabel =
    kind === "DAILY"
      ? new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : `Week of ${new Date(now).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const subjectBits: string[] = [];
  if (counts.overdue) subjectBits.push(`${counts.overdue} overdue`);
  if (counts.dueSoon) subjectBits.push(`${counts.dueSoon} due soon`);
  if (counts.completed) subjectBits.push(`${counts.completed} completed`);
  const subject = `[ProjectOS] ${kind === "DAILY" ? "Daily" : "Weekly"} digest — ${subjectBits.join(" · ") || "all clear"}`;

  return {
    kind,
    periodLabel,
    recipientName,
    subject,
    sections,
    counts,
    text: renderDigestText({
      recipientName,
      periodLabel,
      kind,
      sections,
      counts,
    }),
  };
}

/** Plain-text rendering — what a real SMTP provider would send. */
export function renderDigestText(input: {
  recipientName: string;
  periodLabel: string;
  kind: DigestKind;
  sections: DigestSection[];
  counts: DigestPayload["counts"];
}): string {
  const lines: string[] = [];
  const bar = "─".repeat(52);

  lines.push(`Hi ${input.recipientName.split(" ")[0]},`);
  lines.push("");
  lines.push(
    `Here is your ${input.kind === "DAILY" ? "daily" : "weekly"} project digest for ${input.periodLabel}.`
  );
  lines.push("");
  lines.push(
    `${input.counts.openTotal} open issues across the workspace · ${input.counts.overdue} overdue · ${input.counts.dueSoon} due soon`
  );
  lines.push(bar);

  for (const section of input.sections) {
    if (section.items.length === 0) continue;
    lines.push("");
    lines.push(`${section.title.toUpperCase()} (${section.items.length})`);
    for (const item of section.items) {
      const due = item.dueDate ? ` · due ${fmtDayShort(item.dueDate)}` : "";
      const pri = item.priorityName ? ` [${item.priorityName}]` : "";
      lines.push(`  • ${item.key}  ${item.summary}`);
      lines.push(`      ${item.projectName} · ${item.statusName}${pri}${due}`);
    }
  }

  if (input.sections.every((s) => s.items.length === 0)) {
    lines.push("");
    lines.push("Nothing needs your attention today. Nice.");
  }

  lines.push("");
  lines.push(bar);
  lines.push("Sent by ProjectOS digest scheduler · demo mode: deliveries are logged, not emailed.");
  return lines.join("\n");
}

/** Record a (simulated) delivery in the outbox. */
export async function sendEmail(opts: {
  orgId: string;
  userId: string | null;
  toEmail: string;
  kind: string;
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const row = await db.emailLog.create({
    data: {
      orgId: opts.orgId,
      userId: opts.userId,
      toEmail: opts.toEmail,
      kind: opts.kind,
      subject: opts.subject,
      body: opts.body,
      status: "SIMULATED",
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
  return row.id;
}
