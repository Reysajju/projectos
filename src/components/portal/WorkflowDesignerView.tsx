"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Flag,
  GitBranch,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api3 } from "@/lib/api-client";
import { useCanManage, usePortalStore } from "@/lib/portal-store";
import { invalidateWorkflowCache } from "./use-workflow";
import type {
  StatusCategory,
  WorkflowPayload,
  WorkflowStatusDTO,
  WorkflowTransitionDTO,
} from "@/lib/portal-types";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";

// ─── Layout constants (deterministic graph geometry) ────────────

const NODE_W = 208;
const NODE_H = 62;
const COL_GAP = 96;
const ROW_GAP = 18;
const GRAPH_TOP = 56; // space for column headers
const GRAPH_PAD = 24;

const CATEGORIES: { key: StatusCategory; label: string; hint: string }[] = [
  { key: "TODO", label: "To do", hint: "Work not started" },
  { key: "IN_PROGRESS", label: "In progress", hint: "Active work" },
  { key: "DONE", label: "Done", hint: "Completed work" },
];

const STATUS_COLORS = [
  "#d97706", "#059669", "#7c3aed", "#dc2626", "#0891b2",
  "#c2410c", "#4d7c0f", "#be185d", "#4338ca", "#78716c",
];

interface NodePos {
  status: WorkflowStatusDTO;
  x: number;
  y: number;
  col: number;
}

function layout(statuses: WorkflowStatusDTO[]): { nodes: NodePos[]; width: number; height: number } {
  const byCat: Record<StatusCategory, WorkflowStatusDTO[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
  for (const s of statuses) byCat[s.category]?.push(s);
  (Object.keys(byCat) as StatusCategory[]).forEach((k) =>
    byCat[k].sort((a, b) => a.order - b.order)
  );

  const nodes: NodePos[] = [];
  let maxRows = 0;
  CATEGORIES.forEach((cat, col) => {
    byCat[cat.key].forEach((status, row) => {
      nodes.push({
        status,
        col,
        x: GRAPH_PAD + col * (NODE_W + COL_GAP),
        y: GRAPH_TOP + row * (NODE_H + ROW_GAP),
      });
    });
    maxRows = Math.max(maxRows, byCat[cat.key].length);
  });

  const width = GRAPH_PAD * 2 + 2 * NODE_W + 2 * COL_GAP;
  const height = GRAPH_TOP + Math.max(maxRows, 2) * (NODE_H + ROW_GAP) + ROW_GAP;
  return { nodes, width, height };
}

/** Cubic bezier path between two node edges. */
function edgePath(a: NodePos, b: NodePos): string {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;

  if (b.col > a.col) {
    const dx = Math.max(36, (x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  if (b.col === a.col) {
    // same column: loop out to the right
    const bulge = 46;
    const cx = x1 + bulge;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x1} ${y2}`;
  }
  // backward edge: loop out to the right of the source then back left
  const bulge = 56 + (a.col - b.col) * 44;
  const cy = Math.max(y1, y2) + 34;
  return `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 - bulge} ${cy}, ${x2} ${y2 - 8}`;
}

// ─── Component ──────────────────────────────────────────────────

type ConnectState = { active: boolean; from: string | null } | null;

export function WorkflowDesignerView() {
  const canManage = useCanManage();
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [data, setData] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [connect, setConnect] = useState<ConnectState>(null);
  const [editStatus, setEditStatus] = useState<WorkflowStatusDTO | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await api3.workflow();
      setData(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const layouted = useMemo(() => layout(data?.statuses ?? []), [data]);
  const nodeMap = useMemo(
    () => new Map(layouted.nodes.map((n) => [n.status.id, n])),
    [layouted]
  );

  async function refreshAll() {
    invalidateWorkflowCache();
    await load();
    void refreshWorkspace();
  }

  // ─── Transition actions ───────────────────────────────────────

  const handleNodeClick = useCallback(
    async (statusId: string) => {
      if (!connect?.active || !canManage) {
        return;
      }
      if (!connect.from) {
        setConnect({ active: true, from: statusId });
        return;
      }
      if (connect.from === statusId) {
        setConnect({ active: true, from: null });
        return;
      }
      try {
        await api3.createTransition({ fromStatusId: connect.from, toStatusId: statusId });
        toast.success("Transition added");
        setConnect(null);
        await refreshAll();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add transition");
      }
    },
    [connect, canManage, refreshAll]
  );

  async function deleteTransition(t: WorkflowTransitionDTO) {
    try {
      await api3.deleteTransition(t.id);
      toast.success("Transition removed");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove transition");
    }
  }

  // ─── Loading / permission states ─────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const restricted = data.restricted;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10 text-amber-600">
            <GitBranch className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Workflow designer</h1>
            <p className="text-sm text-muted-foreground">
              Shape how issues move through your workspace — statuses and allowed transitions.
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant={connect?.active ? "default" : "outline"}
              size="sm"
              onClick={() => setConnect(connect?.active ? null : { active: true, from: null })}
            >
              {connect?.active ? <X className="size-4" /> : <GitBranch className="size-4" />}
              {connect?.active ? "Cancel connect" : "Connect statuses"}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New status
            </Button>
          </div>
        )}
      </div>

      {/* Mode banner */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4",
          restricted
            ? "border-amber-600/30 bg-amber-600/5"
            : "border-emerald-600/30 bg-emerald-600/5"
        )}
      >
        {restricted ? (
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" />
        ) : (
          <Unlock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0 text-sm">
          {restricted ? (
            <>
              <span className="font-medium text-amber-700 dark:text-amber-500">Restricted workflow.</span>{" "}
              <span className="text-muted-foreground">
                Issues can only move along the {data.transitions.length} connected transition
                {data.transitions.length === 1 ? "" : "s"} below. Any status change outside the graph is
                rejected.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium text-emerald-700 dark:text-emerald-500">Open workflow.</span>{" "}
              <span className="text-muted-foreground">
                Every status can move to every other status. Connect statuses to restrict movements —
                defining the first transition switches the workspace to a restricted workflow.
              </span>
            </>
          )}
        </div>
      </div>

      {/* Connect-mode hint */}
      {connect?.active && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-600/50 bg-amber-600/5 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-500">
          <ArrowRight className="size-4" />
          {connect.from
            ? "Now pick the target status to complete the transition."
            : "Pick the source status to start a transition."}
        </div>
      )}

      {/* Graph */}
      <div className="overflow-x-auto rounded-lg border bg-card p-2 shadow-sm">
        <div
          className="relative"
          style={{ minWidth: layouted.width, height: layouted.height }}
        >
          {/* Column headers */}
          {CATEGORIES.map((cat, i) => (
            <div
              key={cat.key}
              className="absolute top-0"
              style={{ left: GRAPH_PAD + i * (NODE_W + COL_GAP), width: NODE_W }}
            >
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat.label}
                </span>
                <span className="text-[10px] text-muted-foreground/70">{cat.hint}</span>
              </div>
              <div className="mt-1.5 h-0.5 rounded-full bg-border" />
            </div>
          ))}

          <svg
            ref={svgRef}
            className="pointer-events-none absolute inset-0"
            width={layouted.width}
            height={layouted.height}
          >
            {/* Edges */}
            {data.transitions.map((t) => {
              const a = nodeMap.get(t.fromStatusId);
              const b = nodeMap.get(t.toStatusId);
              if (!a || !b) return null;
              const d = edgePath(a, b);
              const stroke = b.status.color || "#d97706";
              return (
                <g
                  key={t.id}
                  className="pointer-events-auto cursor-pointer group"
                  onClick={() => canManage && deleteTransition(t)}
                >
                  <title>{`${a.status.name} → ${b.status.name}${canManage ? " (click to remove)" : ""}`}</title>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    className="opacity-60 transition-all group-hover:opacity-100 group-hover:[stroke-width:3]"
                  />
                  <circle r={4.5} fill={stroke} className="opacity-80 group-hover:opacity-100">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path={d} />
                  </circle>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {layouted.nodes.map((n) => {
            const isConnectSource = connect?.from === n.status.id;
            const isConnectTarget = connect?.active && !!connect.from && connect.from !== n.status.id;
            return (
              <button
                key={n.status.id}
                type="button"
                onClick={() => void handleNodeClick(n.status.id)}
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                className={cn(
                  "group absolute flex flex-col justify-center rounded-lg border-2 bg-card px-3 text-left shadow-sm transition-all",
                  "hover:shadow-md hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50",
                  connect?.active
                    ? isConnectSource
                      ? "border-amber-600 ring-2 ring-amber-600/30 cursor-pointer"
                      : isConnectTarget
                        ? "cursor-pointer border-dashed border-amber-600/60 hover:border-amber-600"
                        : "cursor-default opacity-50"
                    : "cursor-default",
                  restricted && "shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]"
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: n.status.color }}
                  />
                  <span className="truncate text-sm font-medium">{n.status.name}</span>
                  {n.status.isInitial && (
                    <span
                      title="Initial status — new issues start here"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-600/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500"
                    >
                      <Flag className="size-2.5" />
                      Start
                    </span>
                  )}
                  {canManage && !connect?.active && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${n.status.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditStatus(n.status);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          setEditStatus(n.status);
                        }
                      }}
                      className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-muted-foreground"
                    >
                      <Pencil className="size-3" />
                    </span>
                  )}
                </span>
                <span className="mt-0.5 pl-[18px] text-[11px] text-muted-foreground">
                  {n.status.issueCount} issue{n.status.issueCount === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}

          {/* Empty state within graph */}
          {data.statuses.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <EmptyState
                icon={GitBranch}
                title="No statuses yet"
                hint="Create your first status to start shaping the workflow."
              />
            </div>
          )}
        </div>
      </div>

      {/* Transition list */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Transitions
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {data.transitions.length}
            </span>
          </h2>
          {restricted && canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                if (!confirm("Remove ALL transitions? The workflow becomes open (every move allowed).")) return;
                try {
                  await Promise.all(data.transitions.map((t) => api3.deleteTransition(t.id)));
                  toast.success("Workflow reset to open");
                  await refreshAll();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to reset workflow");
                }
              }}
            >
              <Unlock className="size-3.5" />
              Reset to open workflow
            </Button>
          )}
        </div>
        {data.transitions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No transitions configured — every move is allowed.
            {canManage && (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setConnect({ active: true, from: null })}>
                  <GitBranch className="size-4" />
                  Connect statuses
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto">
            {data.transitions.map((t) => {
              const from = data.statuses.find((s) => s.id === t.fromStatusId);
              const to = data.statuses.find((s) => s.id === t.toStatusId);
              if (!from || !to) return null;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <StatusChip status={from} />
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  <StatusChip status={to} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {from.category !== to.category
                      ? `${CATEGORY_LABEL[from.category]} → ${CATEGORY_LABEL[to.category]}`
                      : `within ${CATEGORY_LABEL[from.category]}`}
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => void deleteTransition(t)}
                      aria-label={`Delete transition ${from.name} to ${to.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Dialogs */}
      <StatusDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={refreshAll}
      />
      {editStatus && (
        <EditStatusDialog
          status={editStatus}
          statuses={data.statuses}
          onClose={() => setEditStatus(null)}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StatusChip({ status }: { status: WorkflowStatusDTO }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
      <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
      {status.name}
    </span>
  );
}

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

function StatusDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("TODO");
  const [color, setColor] = useState(STATUS_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the status a name");
      return;
    }
    setSaving(true);
    try {
      await api3.createStatus({ name: name.trim(), category, color });
      toast.success(`Status "${name.trim()}" created`);
      setName("");
      setCategory("TODO");
      setColor(STATUS_COLORS[0]);
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New status</DialogTitle>
          <DialogDescription>
            Add a column to your workflow. Place it in a category to position it on the board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="status-name">Name</Label>
            <Input
              id="status-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blocked, QA passed…"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as StatusCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {category === "DONE"
                ? "Issues here count as completed."
                : category === "IN_PROGRESS"
                  ? "Issues here are actively worked on."
                  : "Issues here are waiting to be started."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full border-2 transition-transform hover:scale-110",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStatusDialog({
  status,
  statuses,
  onClose,
  onSaved,
}: {
  status: WorkflowStatusDTO;
  statuses: WorkflowStatusDTO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(status.name);
  const [category, setCategory] = useState<StatusCategory>(status.category);
  const [color, setColor] = useState(status.color);
  const [isInitial, setIsInitial] = useState(status.isInitial);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string>("__auto__");
  const [deleting, setDeleting] = useState(false);

  const others = statuses.filter((s) => s.id !== status.id);
  const dirty =
    name !== status.name || category !== status.category || color !== status.color || isInitial !== status.isInitial;

  async function save() {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      await api3.patchStatus(status.id, {
        name: name.trim(),
        category,
        color,
        isInitial,
      });
      toast.success("Status updated");
      onClose();
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api3.deleteStatus(status.id, moveTo === "__auto__" ? undefined : moveTo);
      toast.success(`Status "${status.name}" deleted`);
      setDeleteOpen(false);
      onClose();
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete status");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit status</DialogTitle>
            <DialogDescription>
              {status.issueCount} issue{status.issueCount === 1 ? "" : "s"} currently in this status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-status-name">Name</Label>
              <Input
                id="edit-status-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as StatusCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {STATUS_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => setColor(c)}
                      className={cn(
                        "size-5 rounded-full border-2 transition-transform hover:scale-110",
                        color === c ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Flag className="size-3.5 text-amber-600" />
                  Initial status
                </div>
                <p className="text-xs text-muted-foreground">New issues start in this status.</p>
              </div>
              <Switch checked={isInitial} onCheckedChange={setIsInitial} />
            </div>
          </div>
          <DialogFooter className="items-center">
            <Button
              variant="ghost"
              className="mr-auto text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              Delete “{status.name}”?
            </DialogTitle>
            <DialogDescription>
              {status.issueCount > 0
                ? `${status.issueCount} issue${status.issueCount === 1 ? "" : "s"} will be moved to another status. Transitions connected to this status are removed.`
                : "Transitions connected to this status are removed."}
            </DialogDescription>
          </DialogHeader>
          {status.issueCount > 0 && (
            <div className="space-y-1.5">
              <Label>Move issues to</Label>
              <Select value={moveTo} onValueChange={setMoveTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">
                    <span className="flex items-center gap-2">
                      <Check className="size-3.5 text-emerald-600" />
                      Automatic (initial status)
                    </span>
                  </SelectItem>
                  {others.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                        <ChevronRight className="size-3 text-muted-foreground" />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDelete()} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
