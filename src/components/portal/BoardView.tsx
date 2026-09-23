"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore, useCanManage } from "@/lib/portal-store";
import type { IssueDTO, ProjectDTO, StatusDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { IssueCardBody } from "./IssueCard";
import { FilterBar, matchesFilters, useIssueFilters } from "./issue-filters";
import { useProjectData } from "./project-data";
import { useWorkflowData } from "./use-workflow";
import { Gauge, Plus } from "lucide-react";
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

function DraggableCard({ issue, onOpenIssue }: { issue: IssueDTO; onOpenIssue: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: `card:${issue.id}` });
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div ref={setDropRef}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onPointerDownCapture={(e) => {
          downPos.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          // Suppress click if a drag gesture occurred (moved > 6px).
          const d = downPos.current;
          if (d && (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6)) return;
          onOpenIssue(issue.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpenIssue(issue.id);
        }}
        role="button"
        tabIndex={0}
        aria-label={`Issue ${issue.key}: ${issue.summary}`}
        className={cn("touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-lg", isDragging && "opacity-40")}
      >
        <IssueCardBody issue={issue} />
      </div>
    </div>
  );
}

function BoardColumn({
  status,
  issues,
  limit,
  onOpenIssue,
  onNewIssue,
  dropBlocked,
}: {
  status: StatusDTO;
  issues: IssueDTO[];
  limit?: number;
  onOpenIssue: (id: string) => void;
  onNewIssue: () => void;
  dropBlocked?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.id}` });
  const atLimit = limit != null && issues.length >= limit;
  const overLimit = limit != null && issues.length > limit;
  return (
    <section
      aria-label={`Column ${status.name}${limit != null ? `, WIP limit ${limit}` : ""}${dropBlocked ? ", not allowed by workflow" : ""}`}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-lg bg-muted/80 ring-1 ring-border transition-opacity sm:w-72",
        overLimit && "ring-rose-500/50",
        isOver && overLimit && "ring-2 ring-rose-500/70",
        dropBlocked && "opacity-45 saturate-50"
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-1 pt-3">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status.name}</h3>
        {limit != null ? (
          <span
            className={cn(
              "rounded px-1.5 py-px text-[10px] font-bold tabular-nums ring-1",
              overLimit
                ? "animate-pulse bg-rose-500/15 text-rose-600 ring-rose-500/40 dark:text-rose-400"
                : atLimit
                  ? "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400"
            )}
            title={overLimit ? "WIP limit exceeded" : atLimit ? "WIP limit reached" : "Within WIP limit"}
          >
            {issues.length}/{limit}
          </span>
        ) : (
          <span className="rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{issues.length}</span>
        )}
        <button
          type="button"
          onClick={onNewIssue}
          aria-label={`New issue in ${status.name}`}
          className="ml-auto rounded p-1 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[140px] max-h-[calc(100vh-19rem)] flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5",
          isOver && "bg-amber-500/15 ring-1 ring-inset ring-amber-500/30 rounded-lg"
        )}
      >
        {issues.map((issue) => (
          <DraggableCard key={issue.id} issue={issue} onOpenIssue={onOpenIssue} />
        ))}
        {issues.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border py-6 text-[11px] text-muted-foreground/80">
            Drop issues here
          </div>
        )}
      </div>
    </section>
  );
}

export function BoardView() {
  const { data, applyIssue, refetch } = useProjectData();
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const openCreateIssue = usePortalStore((s) => s.openCreateIssue);
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  const canManage = useCanManage();
  const { workflow, canMove } = useWorkflowData();
  const { filters, patch } = useIssueFilters();
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [wipOpen, setWipOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const statuses = useMemo(
    () => [...(workspace?.statuses ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.issues
      .filter((i) => matchesFilters(i, filters, me?.id ?? null))
      .sort((a, b) => a.order - b.order);
  }, [data, filters, me]);

  const byStatus = useMemo(() => {
    const map = new Map<string, IssueDTO[]>();
    for (const s of statuses) map.set(s.id, []);
    for (const issue of filtered) {
      if (!map.has(issue.statusId)) map.set(issue.statusId, []);
      map.get(issue.statusId)!.push(issue);
    }
    return map;
  }, [statuses, filtered]);

  const activeIssue = activeIssueId ? data?.issues.find((i) => i.id === activeIssueId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveIssueId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    setActiveIssueId(null);
    if (!data || !e.over) return;
    const issue = data.issues.find((i) => i.id === activeId);
    if (!issue) return;

    const overId = String(e.over.id);
    let targetStatusId: string;
    let insertBeforeId: string | null = null;

    if (overId.startsWith("col:")) {
      targetStatusId = overId.slice(4);
    } else if (overId.startsWith("card:")) {
      const overIssueId = overId.slice(5);
      if (overIssueId === issue.id) return;
      const overIssue = data.issues.find((i) => i.id === overIssueId);
      if (!overIssue) return;
      targetStatusId = overIssue.statusId;
      insertBeforeId = overIssue.id;
    } else {
      return;
    }

    const columnIssues = data.issues
      .filter((i) => i.statusId === targetStatusId && i.id !== issue.id)
      .sort((a, b) => a.order - b.order);

    let newOrder: number;
    if (insertBeforeId) {
      const idx = columnIssues.findIndex((i) => i.id === insertBeforeId);
      const prev = idx > 0 ? columnIssues[idx - 1] : null;
      const next = columnIssues[idx] ?? null;
      const lo = prev ? prev.order : next ? next.order - 2 : 0;
      const hi = next ? next.order : prev ? prev.order + 2 : lo + 2;
      newOrder = (lo + hi) / 2;
    } else {
      newOrder = columnIssues.length ? Math.max(...columnIssues.map((i) => i.order)) + 1 : 0;
    }

    const changedStatus = targetStatusId !== issue.statusId;
    const changedOrder = Math.abs(newOrder - issue.order) >= 0.0001;
    if (!changedStatus && !changedOrder) return;

    // Workflow graph guard: reject moves not allowed by the org's workflow
    // before any optimistic update, so the card never flickers.
    if (!canMove(issue.statusId, targetStatusId)) {
      const targetStatus = statuses.find((s) => s.id === targetStatusId);
      const fromStatus = statuses.find((s) => s.id === issue.statusId);
      toast.info("Not allowed by your workflow", {
        description: `${issue.key}: ${fromStatus?.name ?? "?"} → ${targetStatus?.name ?? "?"} is not a connected transition. An admin can adjust it in Workflow.`,
      });
      return;
    }

    const status = statuses.find((s) => s.id === targetStatusId);
    if (!status) return;

    // WIP limit check (advisory): warn when the move exceeds the column limit.
    const limit = data.project.wipLimits?.[targetStatusId];
    const wipExceeded =
      limit != null && issue.statusId !== targetStatusId &&
      data.issues.filter((i) => i.statusId === targetStatusId && i.id !== issue.id).length >= limit;

    // Optimistic update
    applyIssue({ ...issue, statusId: targetStatusId, status, order: newOrder });

    try {
      const updated = await api.patchIssue(issue.id, {
        statusId: targetStatusId,
        order: newOrder,
      });
      applyIssue(updated);
      if (changedStatus) {
        if (wipExceeded) {
          toast.warning(`${status.name} is over its WIP limit (${limit})`, {
            description: `${issue.key} pushed the column past capacity — consider pulling work through.`,
          });
        } else {
          toast.success(`${issue.key} moved to ${status.name}`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move issue");
      void refetch();
    }
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="mx-auto w-full max-w-7xl">
        <FilterBar
          filters={filters}
          patch={patch}
          actions={
            <>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setWipOpen(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  aria-label="Configure WIP limits"
                >
                  <Gauge className="size-3.5" aria-hidden /> WIP limits
                </button>
              )}
              {activeProjectId ? (
                <button
                  type="button"
                  onClick={() => openCreateIssue({ kind: "project", projectId: activeProjectId })}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                >
                  <Plus className="size-3.5" aria-hidden /> New issue
                </button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="mt-3 min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveIssueId(null)}
        >
          <div className="flex h-full items-start gap-3 overflow-x-auto pb-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5">
            {statuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                issues={byStatus.get(status.id) ?? []}
                limit={data.project.wipLimits?.[status.id]}
                dropBlocked={
                  workflow?.restricted &&
                  !!activeIssue &&
                  status.id !== activeIssue.statusId &&
                  !canMove(activeIssue.statusId, status.id)
                }
                onOpenIssue={setOpenIssue}
                onNewIssue={() => openCreateIssue({ kind: "project", projectId: data.project.id })}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180 }}>
            {activeIssue ? (
              <div className="w-[270px] cursor-grabbing sm:w-[282px]">
                <IssueCardBody issue={activeIssue} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <WipLimitsDialog open={wipOpen} onOpenChange={setWipOpen} project={data.project} />
    </div>
  );
}

function WipLimitsDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDTO;
}) {
  const workspace = usePortalStore((s) => s.workspace);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const { refetch } = useProjectData();
  const statuses = useMemo(
    () => [...(workspace?.statuses ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Seed local state from the project each time the dialog opens.
  const seededFor = useRef<string | null>(null);
  if (open && seededFor.current !== project.id) {
    seededFor.current = project.id;
    const seed: Record<string, string> = {};
    for (const [k, v] of Object.entries(project.wipLimits ?? {})) seed[k] = String(v);
    setValues(seed);
  }
  if (!open && seededFor.current !== null) seededFor.current = null;

  async function save() {
    setBusy(true);
    try {
      const wipLimits: Record<string, number> = {};
      for (const [k, v] of Object.entries(values)) {
        const n = Number(v);
        if (v !== "" && Number.isFinite(n) && n > 0) wipLimits[k] = Math.round(n);
      }
      await api.patchProject(project.id, { wipLimits });
      await refreshWorkspace();
      await refetch();
      toast.success("WIP limits saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save WIP limits");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-amber-600" aria-hidden /> Board WIP limits
          </DialogTitle>
          <DialogDescription>
            Cap how many issues a column may hold. Columns show count/limit and turn amber at the limit, red past it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {statuses.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <Label htmlFor={`wip-${s.id}`} className="flex-1 text-sm font-normal">
                {s.name}
              </Label>
              <Input
                id={`wip-${s.id}`}
                type="number"
                min={1}
                max={99}
                placeholder="—"
                className="h-8 w-20 text-right"
                value={values[s.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [s.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-amber-600 hover:bg-amber-700" disabled={busy} onClick={() => void save()}>
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
