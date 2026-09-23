/**
 * ProjectOS email templates — dependency-free, table-based HTML that renders
 * reliably across Gmail / Outlook / Apple Mail, plus plain-text alternates.
 *
 * Design language mirrors the app: stone neutrals + amber accent, generous
 * whitespace, one clear primary action per email.
 */

// ─── Shared building blocks ─────────────────────────────────────

const C = {
  bg: "#f5f5f4",
  card: "#ffffff",
  border: "#e7e5e4",
  text: "#1c1917",
  textMuted: "#78716c",
  textFaint: "#a8a29e",
  amber: "#d97706",
  amberDark: "#b45309",
  amberSoft: "#fef3e7",
  emerald: "#059669",
  emeraldSoft: "#ecfdf5",
  rose: "#e11d48",
  roseSoft: "#fff1f2",
  stone: "#f5f5f4",
  dark: "#1c1917",
} as const;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Brand header — pure HTML/CSS so it renders even with images blocked. */
function brandHeader(orgName?: string): string {
  return `
  <tr><td style="padding:0 32px;" align="left">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="34" height="34" align="center" valign="middle" bgcolor="${C.amber}" style="width:34px;height:34px;border-radius:8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;">P</td>
          </tr></table>
        </td>
        <td style="vertical-align:middle;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <span style="font-size:17px;font-weight:700;color:${C.text};letter-spacing:-0.2px;">ProjectOS</span>
          ${orgName ? `<span style="font-size:13px;color:${C.textMuted};">&nbsp;&nbsp;·&nbsp;&nbsp;${esc(orgName)}</span>` : ""}
        </td>
      </tr>
    </table>
    <div style="height:1px;background:${C.border};line-height:1px;font-size:0;margin-top:14px;">&nbsp;</div>
  </td></tr>`;
}

function brandFooter(note: string, appUrl: string): string {
  return `
  <tr><td style="padding:0 32px;">
    <div style="height:1px;background:${C.border};line-height:1px;font-size:0;margin:26px 0 16px;">&nbsp;</div>
    <p style="margin:0 0 6px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${C.textFaint};">
      ${note}
    </p>
    <p style="margin:0 0 24px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${C.textFaint};">
      Sent by <strong style="color:${C.textMuted};font-weight:600;">ProjectOS</strong> — your in-house project portal ·
      <a href="${appUrl}" style="color:${C.amber};text-decoration:none;">Open ProjectOS</a>
    </p>
  </td></tr>`;
}

function button(url: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;"><tr>
    <td bgcolor="${C.amber}" style="border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:11px 22px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr></table>`;
}

function issueCard(opts: {
  key: string; title: string; projectName: string; statusName: string;
  priorityName?: string | null; extra?: string;
}): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${C.stone};border:1px solid ${C.border};border-radius:10px;margin:18px 0 6px;">
    <tr><td style="padding:14px 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="font-size:12px;font-weight:700;color:${C.amberDark};letter-spacing:0.4px;margin-bottom:3px;">${esc(opts.key)}</div>
      <div style="font-size:15px;font-weight:600;color:${C.text};line-height:22px;">${esc(opts.title)}</div>
      <div style="margin-top:7px;font-size:12px;color:${C.textMuted};">
        ${esc(opts.projectName)} &nbsp;·&nbsp; ${esc(opts.statusName)}${opts.priorityName ? ` &nbsp;·&nbsp; ${esc(opts.priorityName)} priority` : ""}${opts.extra ? ` &nbsp;·&nbsp; ${esc(opts.extra)}` : ""}
      </div>
    </td></tr>
  </table>`;
}

function quote(text: string): string {
  return `
  <div style="margin:16px 0 4px;padding:12px 16px;border-left:3px solid ${C.amber};background:${C.amberSoft};border-radius:0 8px 8px 0;
              font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${C.text};">
    ${esc(text)}
  </div>`;
}

function layout(opts: {
  title: string; intro: string; content: string; footerNote: string; appUrl: string; orgName?: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
    ${brandHeader(opts.orgName)}
    <tr><td style="padding:6px 32px 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <h1 style="margin:20px 0 0;font-size:21px;font-weight:700;color:${C.text};letter-spacing:-0.3px;line-height:30px;">${esc(opts.title)}</h1>
      <p style="margin:10px 0 0;font-size:14px;line-height:22px;color:${C.textMuted};">${opts.intro}</p>
    </td></tr>
    <tr><td style="padding:0 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${opts.content}</td></tr>
    ${brandFooter(opts.footerNote, opts.appUrl)}
  </table>
</td></tr></table>
</body></html>`;
}

// ─── Template contexts ──────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface IssueCtx {
  key: string; title: string; projectName: string; statusName: string; priorityName?: string | null;
  issueId?: string;
}

export type { IssueCtx };

function issueUrl(appUrl: string, issue: IssueCtx): string {
  return issue.issueId ? `${appUrl}/?issue=${encodeURIComponent(issue.issueId)}` : appUrl;
}

export function inviteEmail(opts: {
  appUrl: string; orgName: string; inviterName: string; role: string;
  recipientName: string; claimUrl: string | null; isNewUser: boolean;
}): EmailTemplate {
  const subject = `${opts.inviterName} invited you to ${opts.orgName} on ProjectOS`;
  const action = opts.claimUrl
    ? button(opts.claimUrl, "Join & set your password")
    : button(opts.appUrl, "Open ProjectOS");
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      Hi ${esc(opts.recipientName)}, you have been added to the <strong>${esc(opts.orgName)}</strong>
      workspace as <strong style="color:${C.amberDark};">${esc(opts.role)}</strong>.
    </p>
    ${opts.claimUrl
      ? `<p style="margin:12px 0 0;font-size:13px;line-height:21px;color:${C.textMuted};">
           This link is valid for <strong>7 days</strong> and lets you choose your own password.
         </p>`
      : `<p style="margin:12px 0 0;font-size:13px;line-height:21px;color:${C.textMuted};">
           Use your existing ProjectOS password — the workspace is already in your account.
         </p>`}
    ${action}
    <p style="margin:10px 0 0;font-size:12px;line-height:19px;color:${C.textFaint};">
      ${opts.claimUrl ? `Or copy this link: ${esc(opts.claimUrl)}` : `Or go to: ${esc(opts.appUrl)}`}
    </p>`;
  const text = [
    `Hi ${opts.recipientName},`,
    "",
    `${opts.inviterName} added you to the "${opts.orgName}" workspace on ProjectOS as ${opts.role}.`,
    opts.claimUrl ? `Set your password and join: ${opts.claimUrl}` : `Log in at ${opts.appUrl}`,
  ].join("\n");
  return {
    subject,
    html: layout({
      title: "You're on the team",
      intro: `<strong>${esc(opts.inviterName)}</strong> invited you to collaborate in <strong>${esc(opts.orgName)}</strong>.`,
      content,
      footerNote: "You're receiving this because a workspace admin added your email to ProjectOS.",
      appUrl: opts.appUrl,
      orgName: opts.orgName,
    }),
    text,
  };
}

export function welcomeEmail(opts: {
  appUrl: string; name: string; orgName: string;
}): EmailTemplate {
  const subject = `Welcome to ProjectOS, ${opts.name.split(" ")[0]}`;
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      Your workspace <strong>${esc(opts.orgName)}</strong> is ready — provisioned with default
      issue types, statuses, priorities and labels.
    </p>
    <p style="margin:12px 0 0;font-size:14px;line-height:22px;color:${C.textMuted};">
      Invite teammates from <strong>Team → Add member</strong> and everything they do — assignments,
      status moves, comments — will land in your inbox and theirs.
    </p>
    ${button(opts.appUrl, "Open your workspace")}`;
  return {
    subject,
    html: layout({
      title: "Welcome to ProjectOS 🎉",
      intro: `Hi ${esc(opts.name.split(" ")[0])}, let's get your team shipping.`,
      content,
      footerNote: "You're receiving this because you created a ProjectOS workspace.",
      appUrl: opts.appUrl,
      orgName: opts.orgName,
    }),
    text: `Welcome to ProjectOS!\n\nYour workspace "${opts.orgName}" is ready.\nOpen it: ${opts.appUrl}`,
  };
}

export function resetEmail(opts: { appUrl: string; name: string; resetUrl: string }): EmailTemplate {
  const subject = "Reset your ProjectOS password";
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      Hi ${esc(opts.name.split(" ")[0])}, we received a request to reset your password.
      This link is valid for <strong>1 hour</strong> and can be used once.
    </p>
    ${button(opts.resetUrl, "Choose a new password")}
    <p style="margin:10px 0 0;font-size:12px;line-height:19px;color:${C.textFaint};">
      Or copy this link: ${esc(opts.resetUrl)}<br><br>
      Didn't request this? You can safely ignore this email — your password stays unchanged.
    </p>`;
  return {
    subject,
    html: layout({
      title: "Password reset",
      intro: "Someone (hopefully you) requested a password reset for your ProjectOS account.",
      content,
      footerNote: "You're receiving this because a password reset was requested for this email.",
      appUrl: opts.appUrl,
    }),
    text: `Password reset requested.\n\nChoose a new password (valid 1 hour): ${opts.resetUrl}\n\nIf you didn't request this, ignore this email.`,
  };
}

export function assignedEmail(opts: {
  appUrl: string; actorName: string; issue: IssueCtx; recipientName: string;
}): EmailTemplate {
  const url = issueUrl(opts.appUrl, opts.issue);
  const subject = `${opts.issue.key} assigned to you — ${opts.issue.title}`;
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      <strong>${esc(opts.actorName)}</strong> assigned this issue to you.
    </p>
    ${issueCard(opts.issue)}
    ${button(url, "Open issue")}
    <p style="margin:12px 0 0;font-size:12px;line-height:19px;color:${C.textFaint};">Link: ${esc(url)}</p>`;
  return {
    subject,
    html: layout({
      title: "New issue assigned to you",
      intro: `You've been handed work by <strong>${esc(opts.actorName)}</strong>.`,
      content,
      footerNote: "Manage which events email you from Settings → Email notifications.",
      appUrl: opts.appUrl,
      orgName: opts.issue.projectName,
    }),
    text: `${opts.actorName} assigned you ${opts.issue.key}: ${opts.issue.title}\n${opts.issue.projectName} · ${opts.issue.statusName}\n${url}`,
  };
}

export function statusChangedEmail(opts: {
  appUrl: string; actorName: string; issue: IssueCtx; from: string; to: string;
}): EmailTemplate {
  const subject = `${opts.issue.key} moved to ${opts.to} — ${opts.issue.title}`;
  const url = issueUrl(opts.appUrl, opts.issue);
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      <strong>${esc(opts.actorName)}</strong> moved this issue from
      <strong>${esc(opts.from)}</strong> to
      <span style="background:${C.emeraldSoft};color:${C.emerald};padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;">${esc(opts.to)}</span>
    </p>
    ${issueCard(opts.issue)}
    ${button(url, "Open issue")}`;
  return {
    subject,
    html: layout({
      title: "Issue status changed",
      intro: `An issue you follow changed state.`,
      content,
      footerNote: "Manage which events email you from Settings → Email notifications.",
      appUrl: opts.appUrl,
      orgName: opts.issue.projectName,
    }),
    text: `${opts.actorName} moved ${opts.issue.key} from ${opts.from} to ${opts.to}\n${opts.issue.title}\n${url}`,
  };
}

export function commentEmail(opts: {
  appUrl: string; actorName: string; issue: IssueCtx; commentText: string; mentioned: boolean;
}): EmailTemplate {
  const { mentioned } = opts;
  const subject = `${mentioned ? "You were mentioned in" : "New comment on"} ${opts.issue.key} — ${opts.issue.title}`;
  const url = issueUrl(opts.appUrl, opts.issue);
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      ${mentioned
        ? `<strong>${esc(opts.actorName)}</strong> mentioned you in a comment.`
        : `<strong>${esc(opts.actorName)}</strong> commented on this issue:`}
    </p>
    ${quote(opts.commentText)}
    ${issueCard(opts.issue)}
    ${button(url, "Reply in thread")}`;
  return {
    subject,
    html: layout({
      title: mentioned ? "You were mentioned" : "New comment",
      intro: `Activity on <strong>${esc(opts.issue.key)}</strong> in ${esc(opts.issue.projectName)}.`,
      content,
      footerNote: "Manage which events email you from Settings → Email notifications.",
      appUrl: opts.appUrl,
      orgName: opts.issue.projectName,
    }),
    text: `${opts.actorName}:\n\n${opts.commentText}\n\n${opts.issue.key} — ${opts.issue.title}\n${url}`,
  };
}

export function digestEmail(opts: {
  appUrl: string; recipientName: string; periodLabel: string; kind: "DAILY" | "WEEKLY";
  sections: { id: string; title: string; items: { key: string; summary: string; projectName: string; statusName: string; statusColor: string; priorityName: string | null; dueDate: string | null }[] }[];
  counts: { openTotal: number; overdue: number; dueSoon: number; completed: number };
}): EmailTemplate {
  const when = opts.kind === "DAILY" ? "Daily" : "Weekly";
  const subjectParts: string[] = [];
  if (opts.counts.overdue) subjectParts.push(`${opts.counts.overdue} overdue`);
  if (opts.counts.dueSoon) subjectParts.push(`${opts.counts.dueSoon} due soon`);
  if (opts.counts.completed) subjectParts.push(`${opts.counts.completed} completed`);
  const subject = `[ProjectOS] ${when} digest — ${subjectParts.join(" · ") || "all clear"}`;

  const chipColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : C.amber);
  const sectionsHtml = opts.sections
    .filter((s) => s.items.length > 0)
    .map((s) => `
      <div style="margin:22px 0 8px;font-size:12px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.6px;">
        ${esc(s.title)} (${s.items.length})
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:10px;overflow:hidden;">
        ${s.items
          .map(
            (it, i) => `
        <tr style="background:${i % 2 ? C.stone : C.card};">
          <td style="padding:10px 14px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;border-top:${i ? `1px solid ${C.border}` : "none"};">
            <div style="font-size:12px;font-weight:700;color:${C.amberDark};">${esc(it.key)}</div>
            <div style="font-size:13px;font-weight:600;color:${C.text};line-height:19px;margin-top:1px;">${esc(it.summary)}</div>
            <div style="font-size:11px;color:${C.textMuted};margin-top:3px;">
              ${esc(it.projectName)} ·
              <span style="color:${chipColor(it.statusColor)};font-weight:600;">●</span> ${esc(it.statusName)}
              ${it.priorityName ? ` · ${esc(it.priorityName)}` : ""}
              ${it.dueDate ? ` · due ${esc(new Date(it.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}` : ""}
            </div>
          </td>
        </tr>`,
          )
          .join("")}
      </table>`)
    .join("");

  const empty = `
    <p style="margin:18px 0 0;font-size:14px;line-height:22px;color:${C.textMuted};">
      Nothing needs your attention. Nice. ☕
    </p>`;

  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      <strong>${opts.counts.openTotal}</strong> open issues across the workspace ·
      <strong style="color:${opts.counts.overdue ? C.rose : "inherit"};">${opts.counts.overdue} overdue</strong> ·
      ${opts.counts.dueSoon} due soon · ${opts.counts.completed} recently completed
    </p>
    ${sectionsHtml || empty}
    ${button(opts.appUrl, "Open ProjectOS")}`;

  return {
    subject,
    html: layout({
      title: `Your ${when.toLowerCase()} digest`,
      intro: `Hi ${esc(opts.recipientName.split(" ")[0])} — here's where work stands for <strong>${esc(opts.periodLabel)}</strong>.`,
      content,
      footerNote: "You're receiving this because you're a member of a ProjectOS workspace.",
      appUrl: opts.appUrl,
    }),
    text: [
      `Your ${when.toLowerCase()} digest — ${opts.periodLabel}`,
      `${opts.counts.openTotal} open · ${opts.counts.overdue} overdue · ${opts.counts.dueSoon} due soon`,
      "",
      ...opts.sections
        .filter((s) => s.items.length)
        .flatMap((s) => [
          `${s.title.toUpperCase()} (${s.items.length})`,
          ...s.items.map((it) => `  • ${it.key}  ${it.summary}  [${it.projectName} · ${it.statusName}]`),
          "",
        ]),
      `Open ProjectOS: ${opts.appUrl}`,
    ].join("\n"),
  };
}

export function testEmail(opts: { appUrl: string; recipientName: string; orgName: string }): EmailTemplate {
  const subject = "ProjectOS test email — SMTP is working";
  const content = `
    <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${C.text};">
      Hi ${esc(opts.recipientName.split(" ")[0])}, this is a test delivery from your ProjectOS
      (<strong>${esc(opts.orgName)}</strong>) SMTP configuration.
    </p>
    <p style="margin:12px 0 0;font-size:13px;line-height:21px;color:${C.textMuted};">
      If you can read this, invitations, assignments, comments and digests will all be delivered
      through the same transport.
    </p>
    ${button(opts.appUrl, "Open ProjectOS")}`;
  return {
    subject,
    html: layout({
      title: "SMTP test successful",
      intro: "Great news — your mail transport is configured correctly.",
      content,
      footerNote: "Test email triggered from Settings → Email delivery.",
      appUrl: opts.appUrl,
      orgName: opts.orgName,
    }),
    text: `ProjectOS SMTP test — if you can read this, email delivery works. ${opts.appUrl}`,
  };
}
