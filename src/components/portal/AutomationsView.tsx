"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Filter,
  FlaskConical,
  GitBranch,
  History,
  Loader2,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api2 } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type {
  AutomationActionDTO,
  AutomationConditionDTO,
  AutomationRuleDTO,
} from "@/lib/portal-types";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const TRIGGERS = [
  { value: "issue.created", label: "Issue is created" },
  { value: "issue.status_changed", label: "Status changes" },
  { value: "issue.assigned", label: "Issue is assigned" },
  { value: "comment.created", label: "Comment is added" },
];

const CONDITION_FIELDS = [
  { value: "type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "summary", label: "Summary" },
  { value: "points", label: "Story points" },
  { value: "label", label: "Label" },
];

const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "does not equal" },
  { value: "contains", label: "contains" },
];

type ValueKind = "status" | "type" | "priority" | "member" | "label" | "free" | "none" | "list";

const ACTIONS: { value: string; label: string; valueKind: ValueKind }[] = [
  { value: "assign_user", label: "Assign to member", valueKind: "member" },
  { value: "unassign", label: "Clear assignee", valueKind: "none" },
  { value: "transition_to", label: "Move to status", valueKind: "status" },
  { value: "set_priority", label: "Set priority", valueKind: "priority" },
  { value: "add_label", label: "Add label", valueKind: "label" },
  { value: "remove_label", label: "Remove label", valueKind: "label" },
  { value: "notify_assignee", label: "Notify assignee", valueKind: "none" },
  { value: "notify_user", label: "Notify member", valueKind: "member" },
];

function ValueSelect({
  kind,
  value,
  onChange,
  options: optionsOverride,
}: {
  kind: ValueKind;
  value: string;
  onChange: (v: string) => void;
  /** Explicit option list — takes precedence over the workspace-derived ones. */
  options?: { value: string; label: string }[];
}) {
  const workspace = usePortalStore((s) => s.workspace);
  const options: { value: string; label: string }[] = optionsOverride ?? (() => {
    if (!workspace) return [];
    switch (kind) {
      case "status":
        return [...workspace.statuses].sort((a, b) => a.order - b.order).map((s) => ({ value: s.name, label: s.name }));
      case "type":
        return [...workspace.issueTypes].sort((a, b) => a.order - b.order).map((t) => ({ value: t.name, label: t.name }));
      case "priority":
        return [...workspace.priorities].sort((a, b) => a.order - b.order).map((p) => ({ value: p.name, label: p.name }));
      case "label":
        return workspace.labels.map((l) => ({ value: l.name, label: l.name }));
      case "member":
        return workspace.members.map((m) => ({ value: m.id, label: m.name }));
      default:
        return [];
    }
  })();

  if (kind === "none") return <span className="text-xs italic text-muted-foreground">no value needed</span>;
  if (kind === "free") {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="value"
        className="h-8 flex-1 text-xs"
      />
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 min-w-32 flex-1 text-xs" aria-label="Value">
        <SelectValue placeholder="Pick value" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AutomationRuleDTO | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("issue.status_changed");
  const [conditions, setConditions] = useState<AutomationConditionDTO[]>([]);
  const [actions, setActions] = useState<AutomationActionDTO[]>([{ type: "notify_assignee" }]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProject, setTestProject] = useState("all");
  const [testResult, setTestResult] = useState<
    | {
        scanned: number;
        matchCount: number;
        truncated: boolean;
        matches: {
          id: string; key: string; summary: string;
          status: { name: string; color: string };
          type: { name: string };
          assignee: { id: string; name: string } | null;
          wouldApply: string[];
        }[];
      }
    | null
  >(null);

  useEffect(() => {
    if (!open) return;
    setTestProject("all");
    setTestResult(null);
    if (editing) {
      setName(editing.name);
      setTrigger(editing.trigger);
      setConditions(editing.conditions.map((c) => ({ ...c })));
      setActions(editing.actions.map((a) => ({ ...a })));
    } else {
      setName("");
      setTrigger("issue.status_changed");
      setConditions([{ field: "type", operator: "equals", value: "Bug" }]);
      setActions([{ type: "notify_assignee" }]);
    }
  }, [open, editing]);

  function conditionFieldKind(field: string): "list" | "free" {
    return field === "summary" ? "free" : "list";
  }

  function conditionValueOptions(field: string): { value: string; label: string }[] {
    const workspace = usePortalStore.getState().workspace;
    if (!workspace) return [];
    switch (field) {
      case "type":
        return [...workspace.issueTypes].sort((a, b) => a.order - b.order).map((t) => ({ value: t.name, label: t.name }));
      case "status":
        return [...workspace.statuses].sort((a, b) => a.order - b.order).map((s) => ({ value: s.name, label: s.name }));
      case "priority":
        return [...workspace.priorities].sort((a, b) => a.order - b.order).map((p) => ({ value: p.name, label: p.name }));
      case "label":
        return workspace.labels.map((l) => ({ value: l.name, label: l.name }));
      case "assignee":
        return [
          { value: "me", label: "Me" },
          { value: "none", label: "Unassigned" },
        ];
      case "points":
        return ["1", "2", "3", "5", "8", "13"].map((n) => ({ value: n, label: n }));
      default:
        return [];
    }
  }

  async function runTest(scopeOverride?: string) {
    const scope = scopeOverride ?? testProject;
    setTesting(true);
    try {
      const res = await api2.testAutomation({
        conditions: conditions.filter((c) => c.value || conditionFieldKind(c.field) === "free"),
        actions: actions.map((a) => ({ type: a.type, value: a.value || undefined })),
        projectId: scope === "all" ? null : scope,
      });
      setTestResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test run failed");
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    if (!name.trim()) return toast.error("Give the rule a name");
    if (!actions.length) return toast.error("Add at least one action");
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        trigger,
        conditions: conditions.filter((c) => c.value || conditionFieldKind(c.field) === "free"),
        actions: actions.map((a) => ({ type: a.type, value: a.value || undefined })),
      };
      if (editing) {
        await api2.patchAutomation(editing.id, payload);
        toast.success("Rule updated");
      } else {
        await api2.createAutomation(payload);
        toast.success("Automation created", { description: "It runs on the next matching event." });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-amber-600" aria-hidden />
            {editing ? "Edit automation" : "New automation"}
          </DialogTitle>
          <DialogDescription>When <em>trigger</em>, if <em>conditions</em>, then <em>actions</em>.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="rule-name">Rule name</label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auto-notify on critical bugs"
            />
          </div>

          {/* WHEN */}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              <Play className="size-3" aria-hidden /> When
            </div>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger className="h-8 text-xs" aria-label="Trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* IF */}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                <Filter className="size-3" aria-hidden /> If (all match)
              </div>
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setConditions((c) => [...c, { field: "type", operator: "equals", value: "Bug" }])
                }
              >
                <Plus className="size-3" aria-hidden /> Condition
              </button>
            </div>
            {conditions.length === 0 ? (
              <p className="py-1 text-xs italic text-muted-foreground">No conditions — always runs.</p>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select
                      value={cond.field}
                      onValueChange={(v) =>
                        setConditions((c) => c.map((x, j) => (j === i ? { ...x, field: v, value: "" } : x)))
                      }
                    >
                      <SelectTrigger className="h-8 w-28 shrink-0 text-xs" aria-label="Field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cond.operator}
                      onValueChange={(v) =>
                        setConditions((c) => c.map((x, j) => (j === i ? { ...x, operator: v as AutomationConditionDTO["operator"] } : x)))
                      }
                    >
                      <SelectTrigger className="h-8 w-32 shrink-0 text-xs" aria-label="Operator">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {conditionFieldKind(cond.field) === "free" ? (
                      <Input
                        value={cond.value}
                        onChange={(e) =>
                          setConditions((c) => c.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                        }
                        placeholder="text…"
                        className="h-8 flex-1 text-xs"
                      />
                    ) : (
                      <ValueSelect
                        kind="list"
                        options={conditionValueOptions(cond.field)}
                        value={cond.value}
                        onChange={(v) => setConditions((c) => c.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove condition ${i + 1}`}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => setConditions((c) => c.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* THEN */}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                <GitBranch className="size-3" aria-hidden /> Then
              </div>
            </div>
            <div className="space-y-2">
              {actions.map((action, i) => {
                const meta = ACTIONS.find((a) => a.value === action.type);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select
                      value={action.type}
                      onValueChange={(v) =>
                        setActions((a) => a.map((x, j) => (j === i ? { type: v, value: undefined } : x)))
                      }
                    >
                      <SelectTrigger className="h-8 min-w-40 flex-1 text-xs" aria-label="Action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((a) => (
                          <SelectItem key={a.value} value={a.value} className="text-xs">
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {meta?.valueKind && meta.valueKind !== "none" && (
                      <ValueSelect
                        kind={meta.valueKind}
                        value={action.value ?? ""}
                        onChange={(v) => setActions((a) => a.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove action ${i + 1}`}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => setActions((a) => a.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setActions((a) => [...a, { type: "add_label", value: "" }])}
              >
                <Plus className="size-3" aria-hidden /> Action
              </button>
            </div>
          </div>
        </div>

        {/* Test-run preview */}
        {(testing || testResult) && (
          <div
            className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3"
            aria-live="polite"
          >
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <FlaskConical className="size-3" aria-hidden /> Dry run — no changes applied
            </div>
            {testing ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Matching against the 50 most recently updated issues…
              </div>
            ) : testResult ? (
              testResult.matchCount === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">
                  No issues out of the last {testResult.scanned} updated
                  {testProject === "all" ? "" : " in this project"} would match these conditions.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{testResult.matchCount}</span> of{" "}
                    {testResult.scanned} recent issues would match
                    {testResult.truncated ? " (showing first 10)" : ""}:
                  </p>
                  <ul className="max-h-44 space-y-1 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
                    {testResult.matches.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-md border border-border/70 bg-card px-2.5 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: m.status.color }}
                            aria-hidden
                          />
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{m.key}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{m.summary}</span>
                        </div>
                        {m.wouldApply.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                            {m.wouldApply.map((w, wi) => (
                              <span
                                key={wi}
                                className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <TestScopeSelect
              value={testProject}
              onValueChange={(v) => {
                setTestProject(v);
                setTestResult(null);
                if (v !== "all") void runTest(v);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => void runTest()}
              disabled={testing || busy}
              title="Preview which recent issues this rule would match — nothing is changed"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <FlaskConical className="size-3.5" aria-hidden />
              )}
              Test run
            </Button>
          </div>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => void submit()}
              disabled={busy}
            >
              <Zap className="size-3.5" aria-hidden /> {editing ? "Save changes" : "Create rule"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function triggerLabel(t: string) {
  return TRIGGERS.find((x) => x.value === t)?.label ?? t;
}

function describeCondition(c: AutomationConditionDTO) {
  const field = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field;
  const op = OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
  return `${field} ${op} ${c.value || "…"}`;
}

function describeAction(a: AutomationActionDTO) {
  const meta = ACTIONS.find((x) => x.value === a.type);
  const label = meta?.label ?? a.type;
  return a.value ? `${label}` : label;
}

export function AutomationsView() {
  const role = usePortalStore((s) => s.role);
  const workspace = usePortalStore((s) => s.workspace);
  const [rules, setRules] = useState<AutomationRuleDTO[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRuleDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api2.automations();
      setRules(res.rules);
    } catch {
      setRules([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api2
      .automations()
      .then((res) => {
        if (alive) setRules(res.rules);
      })
      .catch(() => {
        if (alive) setRules([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(rule: AutomationRuleDTO, enabled: boolean) {
    try {
      await api2.patchAutomation(rule.id, { enabled });
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, enabled } : r)) ?? null);
      toast.success(enabled ? `Rule "${rule.name}" enabled` : `Rule "${rule.name}" paused`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rule");
    }
  }

  async function remove(rule: AutomationRuleDTO) {
    try {
      await api2.deleteAutomation(rule.id);
      setRules((prev) => prev?.filter((r) => r.id !== rule.id) ?? null);
      toast.success(`Deleted "${rule.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    }
  }

  const canEdit = role === "ADMIN" || role === "MANAGER" || role === "MEMBER";

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700">
          <Zap className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Automation</h1>
          <p className="text-xs text-muted-foreground">
            No-code rules that run on every event — triggers, conditions and actions.
          </p>
        </div>
        {canEdit && (
          <Button
            className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden /> New rule
          </Button>
        )}
      </div>

      {rules === null ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automation rules yet"
          hint='Create one like: "When status changes → if type = Bug → add label security".'
          action={
            canEdit ? (
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-3.5" aria-hidden /> Create your first rule
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                "rounded-lg border border-border bg-card p-4 transition-opacity",
                !rule.enabled && "opacity-60"
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    rule.enabled ? "bg-amber-600/10 text-amber-700" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Zap className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{rule.name}</span>
                    {!rule.enabled && (
                      <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">
                        <CircleSlash className="size-3" aria-hidden /> Paused
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {rule.runCount} run{rule.runCount === 1 ? "" : "s"}
                    {rule.lastRunAt
                      ? ` · last ${formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}`
                      : " · never run"}
                    {rule.lastRunResult ? ` · ${rule.lastRunResult}` : ""}
                  </div>
                </div>
                <Avatar name={rule.creator.name} color={rule.creator.avatarColor} size="xs" />
                <Switch checked={rule.enabled} onCheckedChange={(v) => void toggle(rule, v)} aria-label={`Toggle ${rule.name}`} />
                {canEdit && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(rule);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => void remove(rule)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </>
                )}
              </div>

              {/* Rule pipeline */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded bg-amber-600/10 px-2 py-1 font-medium text-amber-600">
                  WHEN {triggerLabel(rule.trigger)}
                </span>
                {rule.conditions.length > 0 && (
                  <>
                    <ArrowRight className="size-3 text-muted-foreground/50" aria-hidden />
                    <span className="rounded bg-violet-500/10 px-2 py-1 font-medium text-violet-500 dark:text-violet-300">
                      IF {rule.conditions.map(describeCondition).join(" AND ")}
                    </span>
                  </>
                )}
                <ArrowRight className="size-3 text-muted-foreground/50" aria-hidden />
                <span className="rounded bg-emerald-500/10 px-2 py-1 font-medium text-emerald-500 dark:text-emerald-300">
                  THEN {rule.actions.map(describeAction).join(", ")}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground">
            <History className="size-3.5 shrink-0" aria-hidden />
            Rules run server-side on every matching event. Action effects appear in each issue&apos;s activity feed.
            {workspace ? " Members are notified instantly." : ""}
          </div>
        </div>
      )}

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}

// ─── Test-run scope selector ─────────────────────────────────────

function TestScopeSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (v: string) => void;
}) {
  const projects = usePortalStore((s) => s.workspace?.projects ?? []);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className="h-9 w-40 shrink-0 text-xs"
        aria-label="Test-run project scope"
        title="Limit the dry run to one project"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">
          All projects
        </SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            {p.key} · {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
