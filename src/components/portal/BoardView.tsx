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
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, StatusDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { IssueCardBody } from "./IssueCard";
import { FilterBar, matchesFilters, useIssueFilters } from "./issue-filters";
import { useProjectData } from "./project-data";
import { Plus } from "lucide-react";

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
  onOpenIssue,
  onNewIssue,
}: {
  status: StatusDTO;
  issues: IssueDTO[];
  onOpenIssue: (id: string) => void;
  onNewIssue: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.id}` });
  return (
    <section
      aria-label={`Column ${status.name}`}
      className="flex w-[280px] shrink-0 flex-col rounded-lg bg-stone-100/80 ring-1 ring-stone-200/60 sm:w-72"
    >
      <header className="flex items-center gap-2 px-3 pb-1 pt-3">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-600">{status.name}</h3>
        <span className="rounded bg-stone-200/80 px-1.5 text-[10px] font-semibold text-stone-500">{issues.length}</span>
        <button
          type="button"
          onClick={onNewIssue}
          aria-label={`New issue in ${status.name}`}
          className="ml-auto rounded p-1 text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[140px] max-h-[calc(100vh-19rem)] flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5",
          isOver && "bg-amber-100/40 ring-1 ring-inset ring-amber-500/30 rounded-lg"
        )}
      >
        {issues.map((issue) => (
          <DraggableCard key={issue.id} issue={issue} onOpenIssue={onOpenIssue} />
        ))}
        {issues.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-stone-300/80 py-6 text-[11px] text-stone-400">
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
  const { filters, patch } = useIssueFilters();
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

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

    const status = statuses.find((s) => s.id === targetStatusId);
    if (!status) return;

    // Optimistic update
    applyIssue({ ...issue, statusId: targetStatusId, status, order: newOrder });

    try {
      const updated = await api.patchIssue(issue.id, {
        statusId: targetStatusId,
        order: newOrder,
      });
      applyIssue(updated);
      if (changedStatus) toast.success(`${issue.key} moved to ${status.name}`);
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
            activeProjectId ? (
              <button
                type="button"
                onClick={() => openCreateIssue({ kind: "project", projectId: activeProjectId })}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <Plus className="size-3.5" aria-hidden /> New issue
              </button>
            ) : null
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
    </div>
  );
}
