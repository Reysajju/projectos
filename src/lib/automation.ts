/**
 * Automation engine — event-driven, no-code rules (blueprint §19).
 * Called fire-and-forget after mutations. Actions write directly (no
 * re-trigger) to avoid loops; every run is audited on the rule row.
 *
 * Rule shape:
 *   trigger: issue.created | issue.status_changed | issue.assigned | comment.created
 *   conditions: [{ field, operator, value }]
 *   actions:    [{ type, value }]
 */
import { db } from "@/lib/db";
import { logActivity, notify } from "@/lib/workflow";

export type AutomationField =
  | "type" | "status" | "priority" | "assignee" | "summary" | "points" | "label";

export interface AutomationCondition {
  field: AutomationField | string;
  operator: "equals" | "notEquals" | "contains";
  value: string;
}

export interface AutomationAction {
  type:
    | "assign_user" | "unassign"
    | "set_priority" | "transition_to"
    | "add_label" | "remove_label"
    | "notify_user" | "notify_assignee";
  value?: string;
}

export const AUTOMATION_TRIGGERS = [
  { value: "issue.created", label: "Issue is created" },
  { value: "issue.status_changed", label: "Status changes" },
  { value: "issue.assigned", label: "Issue is assigned" },
  { value: "comment.created", label: "Comment is added" },
] as const;

export const AUTOMATION_ACTION_TYPES = [
  { value: "assign_user", label: "Assign to member", needsValue: "member" },
  { value: "unassign", label: "Clear assignee", needsValue: null },
  { value: "set_priority", label: "Set priority", needsValue: "priority" },
  { value: "transition_to", label: "Move to status", needsValue: "status" },
  { value: "add_label", label: "Add label", needsValue: "label" },
  { value: "remove_label", label: "Remove label", needsValue: "label" },
  { value: "notify_user", label: "Notify member", needsValue: "member" },
  { value: "notify_assignee", label: "Notify assignee", needsValue: null },
] as const;

function json<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

interface IssueCtx {
   
  issue: any; // full issue with type/status/priority/labels/assignee
  actor: { id: string; name: string };
  orgId: string;
  commentBody?: string;
}

function evalCondition(cond: AutomationCondition, c: IssueCtx): boolean {
  const issue = c.issue;
  const eq = (a: unknown, b: string) => String(a ?? "").toLowerCase() === b.trim().toLowerCase();
  switch (cond.field) {
    case "type": {
      const match = eq(issue.type?.name, cond.value);
      return cond.operator === "equals" ? match : cond.operator === "notEquals" ? !match : false;
    }
    case "status": {
      const match = eq(issue.status?.name, cond.value);
      return cond.operator === "equals" ? match : cond.operator === "notEquals" ? !match : false;
    }
    case "priority": {
      const name = issue.priority?.name ?? "";
      const match = cond.value.toLowerCase() === "none" ? !name : eq(name, cond.value);
      return cond.operator === "equals" ? match : cond.operator === "notEquals" ? !match : false;
    }
    case "assignee": {
      const v = cond.value.trim().toLowerCase();
      const assigneeId = issue.assigneeId ?? "";
      const match = v === "none" || v === "unassigned"
        ? !assigneeId
        : v === "me"
          ? assigneeId === c.actor.id
          : !!assigneeId;
      return cond.operator === "equals" ? match : cond.operator === "notEquals" ? !match : false;
    }
    case "summary": {
      const hay = (issue.summary ?? "").toLowerCase();
      const match = hay.includes(cond.value.trim().toLowerCase());
      return cond.operator === "notEquals" ? !match : match;
    }
    case "points": {
      const n = Number(cond.value);
      const match = issue.storyPoints === n;
      return cond.operator === "equals" ? match : cond.operator === "notEquals" ? !match : false;
    }
    case "label": {
      const has = (issue.labels ?? []).some((l: { label?: { name?: string } }) =>
        (l.label?.name ?? "").toLowerCase() === cond.value.trim().toLowerCase()
      );
      return cond.operator === "notEquals" ? !has : has;
    }
    default:
      return true;
  }
}

async function runRule(rule: {
  id: string; name: string; actions: string; createdBy: string;
}, c: IssueCtx, members: { userId: string; user: { name: string } }[]): Promise<string> {
  const actions = json<AutomationAction[]>(rule.actions, []);
  const applied: string[] = [];
  const actor = c.actor;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "assign_user": {
          if (!action.value) break;
          await db.issue.update({ where: { id: c.issue.id }, data: { assigneeId: action.value } });
          await notify({
            orgId: c.orgId, userId: action.value, type: "assigned",
            title: `You were assigned ${c.issue.key} by automation`,
            body: `Rule "${rule.name}"`, issueId: c.issue.id,
          });
          applied.push(`assigned → member`);
          break;
        }
        case "unassign":
          await db.issue.update({ where: { id: c.issue.id }, data: { assigneeId: null } });
          applied.push("assignee cleared");
          break;
        case "set_priority": {
          if (!action.value) break;
          const pr = await db.priority.findFirst({ where: { orgId: c.orgId } }).then((list) => (Array.isArray(list) ? list : [list])).then((arr) => arr.find((x) => x && x.name.toLowerCase() === action.value.trim().toLowerCase()));
          if (pr) {
            await db.issue.update({ where: { id: c.issue.id }, data: { priorityId: pr.id } });
            applied.push(`priority → ${pr.name}`);
          }
          break;
        }
        case "transition_to": {
          if (!action.value) break;
          const statuses = await db.status.findMany({ where: { orgId: c.orgId } });
          const st = statuses.find((x) => x.name.toLowerCase() === action.value.trim().toLowerCase());
          if (st && st.id !== c.issue.statusId) {
            await db.issue.update({ where: { id: c.issue.id }, data: { statusId: st.id } });
            await logActivity({
              orgId: c.orgId, userId: actor.id, issueId: c.issue.id, projectId: c.issue.projectId,
              type: "issue.status_changed", field: "status",
              oldValue: c.issue.status?.name ?? "", newValue: st.name,
            });
            applied.push(`status → ${st.name}`);
          }
          break;
        }
        case "add_label": {
          if (!action.value) break;
          let label = (await db.label.findMany({ where: { orgId: c.orgId } })).find((x) => x.name.toLowerCase() === action.value.trim().toLowerCase());
          if (!label) label = await db.label.create({ data: { orgId: c.orgId, name: action.value.toLowerCase(), color: "#d97706" } });
          await db.issueLabel.upsert({
            where: { issueId_labelId: { issueId: c.issue.id, labelId: label.id } },
            create: { issueId: c.issue.id, labelId: label.id },
            update: {},
          });
          applied.push(`label +${label.name}`);
          break;
        }
        case "remove_label": {
          if (!action.value) break;
          const label = (await db.label.findMany({ where: { orgId: c.orgId } })).find((x) => x.name.toLowerCase() === action.value.trim().toLowerCase());
          if (label) {
            await db.issueLabel.deleteMany({ where: { issueId: c.issue.id, labelId: label.id } });
            applied.push(`label -${label.name}`);
          }
          break;
        }
        case "notify_user": {
          if (!action.value) break;
          await notify({
            orgId: c.orgId, userId: action.value, type: "automation",
            title: `Automation: ${rule.name}`, body: `Triggered on ${c.issue.key}`, issueId: c.issue.id,
          });
          applied.push("notified member");
          break;
        }
        case "notify_assignee": {
          if (c.issue.assigneeId && c.issue.assigneeId !== actor.id) {
            await notify({
              orgId: c.orgId, userId: c.issue.assigneeId, type: "automation",
              title: `Automation: ${rule.name}`, body: `Triggered on ${c.issue.key}`, issueId: c.issue.id,
            });
            applied.push("notified assignee");
          }
          break;
        }
      }
    } catch {
      // individual action failures don't abort the rule
    }
  }

  void members; // reserved for member-scoped actions
  return applied.length ? applied.join(", ") : "no actions applied";
}

/**
 * Fire automations for an event. Fire-and-forget safe: catches all errors,
 * never throws into the request path.
 */
export async function runAutomations(
  event: "issue.created" | "issue.status_changed" | "issue.assigned" | "comment.created",
  ctx: { orgId: string; issueId: string; actor: { id: string; name: string }; commentBody?: string }
): Promise<void> {
  try {
    const rules = await db.automationRule.findMany({
      where: { orgId: ctx.orgId, trigger: event, enabled: true },
      orderBy: { createdAt: "asc" },
    });
    if (!rules.length) return;

     
    const issue = await db.issue.findUnique({
      where: { id: ctx.issueId },
      include: { type: true, status: true, priority: true, labels: { include: { label: true } } },
    });
    if (!issue) return;

    const members = await db.organizationMember.findMany({
      where: { orgId: ctx.orgId },
      select: { userId: true, user: { select: { name: true } } },
    });

    const c: IssueCtx = { issue, actor: ctx.actor, orgId: ctx.orgId, commentBody: ctx.commentBody };

    for (const rule of rules) {
      const conditions = json<AutomationCondition[]>(rule.conditions, []);
      const passed = conditions.every((cond) => evalCondition(cond, c));
      if (!passed) {
        await db.automationRule.update({
          where: { id: rule.id },
          data: { lastRunAt: new Date(), lastRunResult: "conditions not met", runCount: { increment: 0 } },
        });
        continue;
      }
      const result = await runRule(rule, c, members);
      await db.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 }, lastRunResult: result },
      });
    }
  } catch {
    // automations must never break the request path
  }
}
