"use client";

/**
 * RoadmapView — Gantt-style timeline for a project.
 *
 * • Sprint bands (ACTIVE / FUTURE / COMPLETED) on a shared day grid.
 * • Epic bars (startDate → dueDate) with child-completion progress.
 * • Drag a bar to move it, drag its edges to resize — commits via PATCH.
 * • Unscheduled epics get a quick inline date popover.
 * • Month/Quarter zoom, today marker, sticky left label column.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
} from "date-fns";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Flag,
  Inbox,
  Layers,
  Link2,
  Loader2,
  Target,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, IssueEdgeDTO, IssueLinkType, SprintDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectData } from "./project-data";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { EmptyState } from "./EmptyState";

type Zoom = "month" | "quarter";
type DragMode = "move" | "resize-l" | "resize-r";

const LABEL_W = 232;
const DAY_W: Record<Zoom, number> = { month: 9, quarter: 3.5 };
const ROW_H = 40;
const CHILD_H = 32;
const STORY_DIVIDER_H = 28;

/** Bar geometry shared by the rendered rows and the arrow layout (must stay in sync). */
function barGeom(
  issue: IssueDTO,
  min: Date,
  dayW: number,
  startFallback?: Date
): { left: number; width: number } {
  const start = issue.startDate ? toDay(issue.startDate) : startFallback ?? toDay(issue.createdAt);
  const end = issue.dueDate ? toDay(issue.dueDate) : start;
  const left = Math.max(differenceInCalendarDays(start, min), 0) * dayW;
  const width = Math.max((differenceInCalendarDays(end, start) + 1) * dayW, dayW * 2);
  return { left, width };
}

/** Dependency arrow styling per link type (blueprint §16 × §8). */
const EDGE_COLORS: Record<IssueLinkType, string> = {
  BLOCKS: "#f59e0b",
  CAUSES: "#f43f5e",
  DUPLICATES: "#8b5cf6",
  RELATES: "#a8a29e",
};

interface RowGeom {
  top: number;
  height: number;
  left: number;
  width: number;
  hasBar: boolean;
}
interface RowLayout {
  byId: Map<string, RowGeom>;
  totalHeight: number;
}

interface DragState {
  issueId: string;
  mode: DragMode;
  startX: number;
  deltaDays: number;
}

/** Local copy of an epic's schedule used while dragging/previewing. */
interface ScheduleOverride {
  start: Date;
  end: Date;
}

function toDay(v: string | Date): Date {
  return startOfDay(typeof v === "string" ? new Date(v) : v);
}

function isoDay(d: Date): string {
  return d.toISOString();
}

function hexAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

export function RoadmapView() {
  const { data, applyIssue } = useProjectData();
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const types = usePortalStore((s) => s.workspace?.issueTypes ?? []);
  const [zoom, setZoom] = useState<Zoom>("month");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overrides, setOverrides] = useState<Map<string, ScheduleOverride>>(new Map());
  const [showLinks, setShowLinks] = useState(true);
  const [showStories, setShowStories] = useState(true);
  const [hoverEdge, setHoverEdge] = useState<IssueEdgeDTO | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const dayW = DAY_W[zoom];

  const epics = useMemo(() => {
    if (!data) return [];
    const epicTypeNames = new Set(["epic"]);
    const epicTypeIds = new Set(
      types.filter((t) => epicTypeNames.has(t.name.toLowerCase())).map((t) => t.id)
    );
    const byId = new Map(data.issues.map((i) => [i.id, i]));
    const isEpic = (i: IssueDTO) => epicTypeIds.has(i.typeId) || (!i.parentId && byId.has(i.parentId ?? ""));
    return data.issues
      .filter((i) => epicTypeIds.has(i.typeId) || data.issues.some((c) => c.parentId === i.id))
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map((epic) => ({
        epic,
        children: data.issues
          .filter((i) => i.parentId === epic.id)
          .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
      }));
  }, [data, types]);

  /** Computed schedule for an epic, honoring explicit dates then children. */
  const scheduleOf = useCallback(
    (epic: IssueDTO): { start: Date | null; end: Date | null } => {
      if (epic.startDate && epic.dueDate) return { start: toDay(epic.startDate), end: toDay(epic.dueDate) };
      const children = data?.issues.filter((i) => i.parentId === epic.id) ?? [];
      const starts: Date[] = [];
      const ends: Date[] = [];
      if (epic.startDate) starts.push(toDay(epic.startDate));
      if (epic.dueDate) ends.push(toDay(epic.dueDate));
      for (const c of children) {
        if (c.startDate) starts.push(toDay(c.startDate));
        if (c.dueDate) ends.push(toDay(c.dueDate));
      }
      const start = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
      const end = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
      return { start, end: end ?? start };
    },
    [data]
  );

  const epicIds = useMemo(() => new Set(epics.map(({ epic }) => epic.id)), [epics]);

  /**
   * Scheduled standalone stories — non-epic, non-child issues with explicit dates.
   * Rendered after the epic rows when "Stories" scope is on; powers dependency arrows.
   */
  const stories = useMemo(() => {
    if (!data) return [];
    return data.issues
      .filter((i) => !epicIds.has(i.id) && !i.parentId && (i.startDate || i.dueDate))
      .sort((a, b) => {
        const aT = new Date(a.startDate ?? a.dueDate ?? a.createdAt).getTime();
        const bT = new Date(b.startDate ?? b.dueDate ?? b.createdAt).getTime();
        return aT - bT || a.key.localeCompare(b.key, undefined, { numeric: true });
      });
  }, [data, epicIds]);

  // ── Timeline window ────────────────────────────────────────────
  const window_ = useMemo(() => {
    if (!data) return null;
    const stamps: Date[] = [];
    for (const s of data.sprints) {
      if (s.startDate) stamps.push(toDay(s.startDate));
      if (s.endDate) stamps.push(toDay(s.endDate));
    }
    for (const e of epics) {
      const { start, end } = scheduleOf(e.epic);
      if (start) stamps.push(start);
      if (end) stamps.push(end);
      for (const c of e.children) if (c.dueDate) stamps.push(toDay(c.dueDate));
    }
    for (const st of stories) {
      if (st.startDate) stamps.push(toDay(st.startDate));
      if (st.dueDate) stamps.push(toDay(st.dueDate));
    }
    const today = toDay(new Date());
    let min = stamps.length ? new Date(Math.min(...stamps.map((d) => d.getTime()))) : addDays(today, -14);
    let max = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : addDays(today, 60);
    min = startOfMonth(addDays(min, -7));
    max = endOfMonth(addDays(max, 14));
    if (min > addDays(today, -1)) min = startOfMonth(addDays(today, -30));
    if (max < addDays(today, 1)) max = endOfMonth(addDays(today, 45));
    if (differenceInCalendarDays(max, min) < 80) max = addDays(min, 100);
    return { min, max, totalDays: differenceInCalendarDays(max, min) + 1, today };
  }, [data, epics, scheduleOf, stories]);

  const timelineW = (window_?.totalDays ?? 1) * dayW;

  /** Issues whose rows light up while a dependency arrow is hovered. */
  const highlightIds = useMemo(
    () => (hoverEdge ? new Set([hoverEdge.sourceId, hoverEdge.targetId]) : new Set<string>()),
    [hoverEdge]
  );

  const months = useMemo(() => {
    if (!window_) return [];
    const out: { label: string; left: number; width: number; thisMonth: boolean }[] = [];
    let cur = startOfMonth(window_.min);
    while (cur <= window_.max) {
      const next = startOfMonth(addDays(endOfMonth(cur), 1));
      const from = Math.max(differenceInCalendarDays(cur, window_.min), 0);
      const to = Math.min(differenceInCalendarDays(next, window_.min), window_.totalDays);
      out.push({
        label: format(cur, zoom === "month" ? "MMMM yyyy" : "MMM"),
        left: from * dayW,
        width: (to - from) * dayW,
        thisMonth: isSameDay(cur, startOfMonth(window_.today)),
      });
      cur = next;
    }
    return out;
  }, [window_, dayW, zoom]);

  const todayLeft = window_ ? differenceInCalendarDays(window_.today, window_.min) * dayW + dayW / 2 : 0;

  // ── Row layout (mirrors the rendered rows 1:1, powers dependency arrows) ──
  const layout = useMemo<RowLayout>(() => {
    const byId = new Map<string, RowGeom>();
    let top = 0;
    if (data && window_) {
      for (const { epic, children } of epics) {
        const base = scheduleOf(epic);
        if (!base.start) {
          // Unscheduled rows render as a fixed-height label-only row.
          byId.set(epic.id, { top, height: ROW_H, left: 0, width: 0, hasBar: false });
          top += ROW_H;
          continue;
        }
        const s = base.start;
        const e2 = base.end ?? addDays(s, 13);
        const left = Math.max(differenceInCalendarDays(s, window_.min), 0) * dayW;
        const width = Math.max((differenceInCalendarDays(e2, s) + 1) * dayW, dayW * 5);
        byId.set(epic.id, { top, height: ROW_H, left, width, hasBar: true });
        top += ROW_H;
        if (!collapsed.has(epic.id)) {
          for (const child of children) {
            const geom = barGeom(child, window_.min, dayW);
            byId.set(child.id, { top, height: CHILD_H, left: geom.left, width: geom.width, hasBar: true });
            top += CHILD_H;
          }
        }
      }
      if (showStories && stories.length > 0) {
        top += STORY_DIVIDER_H; // section divider row
        for (const st of stories) {
          const geom = barGeom(st, window_.min, dayW);
          byId.set(st.id, { top, height: CHILD_H, left: geom.left, width: geom.width, hasBar: true });
          top += CHILD_H;
        }
      }
    }
    return { byId, totalHeight: top };
  }, [data, window_, epics, scheduleOf, collapsed, dayW, showStories, stories]);

  // ── Drag handling ──────────────────────────────────────────────
  function onBarPointerDown(e: React.PointerEvent, epic: IssueDTO, mode: DragMode) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ issueId: epic.id, mode, startX: e.clientX, deltaDays: 0 });
  }

  function onBarPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !window_) return;
    const raw = Math.round((e.clientX - d.startX) / dayW);
    const delta = Math.max(raw, 0 - window_.totalDays);
    if (delta !== d.deltaDays) setDrag({ ...d, deltaDays: delta });
  }

  async function onBarPointerUp(epic: IssueDTO, base: { start: Date; end: Date }) {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const wasDrag = d.deltaDays !== 0;

    if (!wasDrag) {
      if (d.mode === "move") setOpenIssue(epic.id); // simple click
      return;
    }

    let start = base.start;
    let end = base.end;
    if (d.mode === "move") {
      start = addDays(start, d.deltaDays);
      end = addDays(end, d.deltaDays);
    } else if (d.mode === "resize-l") {
      start = addDays(start, d.deltaDays);
      if (start > end) start = end;
    } else {
      end = addDays(end, d.deltaDays);
      if (end < start) end = start;
    }

    // Optimistic visual
    setOverrides((m) => new Map(m).set(epic.id, { start, end }));
    try {
      const updated = await api.patchIssue(epic.id, { startDate: isoDay(start), dueDate: isoDay(end) });
      applyIssue(updated);
      setOverrides((m) => {
        const next = new Map(m);
        next.delete(epic.id);
        return next;
      });
      toast.success(`${epic.key} scheduled ${format(start, "MMM d")} → ${format(end, "MMM d")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
      setOverrides((m) => {
        const next = new Map(m);
        next.delete(epic.id);
        return next;
      });
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function scrollToToday() {
    scrollRef.current?.scrollTo({ left: Math.max(todayLeft - 240, 0), behavior: "smooth" });
  }

  if (!data || !window_) return null;

  const sprintsWithDates = data.sprints.filter((s) => s.startDate && s.endDate);
  const unscheduled = epics.filter(({ epic }) => {
    const { start } = scheduleOf(epic);
    return !start;
  });

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Timeline zoom">
          {(["month", "quarter"] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                zoom === z ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {z}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={scrollToToday}>
          <Target className="size-3.5" aria-hidden /> Today
        </Button>
        <button
          type="button"
          onClick={() => setShowLinks((v) => !v)}
          aria-pressed={showLinks}
          title={showLinks ? "Hide dependency arrows" : "Show dependency arrows"}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            showLinks
              ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Link2 className="size-3.5" aria-hidden /> Links
        </button>
        <button
          type="button"
          onClick={() => setShowStories((v) => !v)}
          aria-pressed={showStories}
          title={showStories ? "Show epics only" : "Also plot scheduled issues (stories with dates)"}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            showStories
              ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="size-3.5" aria-hidden /> Stories
        </button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: hexAlpha(data.project.color, "cc") }} aria-hidden />
            Epic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-emerald-500" aria-hidden /> Done sprint
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-amber-500" aria-hidden /> Active sprint
          </span>
          <span className="hidden items-center gap-1.5 lg:flex">
            <svg width="15" height="8" viewBox="0 0 15 8" aria-hidden>
              <line x1="0" y1="4" x2="10" y2="4" stroke="#f59e0b" strokeWidth="1.75" />
              <path d="M 10 1 L 14.5 4 L 10 7 z" fill="#f59e0b" />
            </svg>
            Dependency
          </span>
          <span className="hidden items-center gap-1.5 md:flex">Hover an arrow to trace its issues</span>
        </div>
      </div>

      {epics.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={CalendarRange}
            title="Nothing to map yet"
            hint="Create epics (or parent issues with subtasks) to see them on the roadmap."
          />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={cn(
            "relative mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card",
            drag && "select-none",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2"
          )}
        >
          <div className="relative" style={{ width: LABEL_W + timelineW, minWidth: "100%" }}>
            {/* ── Header: sticky month band ── */}
            <div className="sticky top-0 z-20 flex h-10 border-b border-border bg-card/95 backdrop-blur">
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                style={{ width: LABEL_W }}
              >
                Roadmap
              </div>
              <div className="relative h-full" style={{ width: timelineW }}>
                {months.map((m) => (
                  <div
                    key={m.label + m.left}
                    className={cn(
                      "absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap border-l border-border/70 px-2 text-[11px] font-semibold",
                      m.thisMonth ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                    )}
                    style={{ left: m.left, width: m.width }}
                  >
                    {zoom === "quarter" ? m.label : m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Sprint bands ── */}
            {sprintsWithDates.length > 0 && (
              <div className="relative flex border-b border-border/60 bg-muted/30" style={{ height: ROW_H }}>
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ width: LABEL_W }}
                >
                  <Zap className="size-3 text-amber-500" aria-hidden /> Sprints
                </div>
                <div className="relative" style={{ width: timelineW }}>
                  {sprintsWithDates.map((sprint) => (
                    <SprintBand key={sprint.id} sprint={sprint} min={window_.min} dayW={dayW} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Epic + child rows ── */}
            <div className="relative">
              {/* dependency arrows overlay (hidden while dragging — geometry is committed-data based) */}
              {showLinks && !drag && data.links.length > 0 && layout.totalHeight > 0 && (
                <DependencyArrows
                  edges={data.links}
                  layout={layout}
                  labelW={LABEL_W}
                  timelineW={timelineW}
                  issues={data.issues}
                  hoveredId={hoverEdge?.id ?? null}
                  onHover={setHoverEdge}
                />
              )}

              {/* today line spanning all rows */}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-px"
                style={{ left: LABEL_W + todayLeft }}
                aria-hidden
              >
                <div className="h-full w-px bg-amber-500/70" />
                <div className="absolute -top-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-b bg-amber-500 px-1 text-[9px] font-bold text-white">
                  TODAY
                </div>
              </div>

              {epics.map(({ epic, children }) => {
                const base = scheduleOf(epic);
                const ovr = overrides.get(epic.id);
                const dragState = drag?.issueId === epic.id ? drag : null;
                const start = dragState ? addDays(base.start ?? window_.today, 0) : base.start;
                const end = dragState ? addDays(base.end ?? base.start ?? window_.today, dragState.deltaDays) : (ovr ? ovr.end : base.end);
                const startPos = dragState?.mode === "resize-l" && base.start ? addDays(base.start, dragState.deltaDays) : start;
                const isCollapsed = collapsed.has(epic.id);
                const doneChildren = children.filter((c) => c.status.category === "DONE").length;
                const progress = children.length ? doneChildren / children.length : epic.status.category === "DONE" ? 1 : 0;

                if (!base.start && !dragState) {
                  return (
                    <div
                      key={epic.id}
                      className={cn(
                        "relative flex items-center border-b border-border/40",
                        highlightIds.has(epic.id) && "bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
                      )}
                      style={{ height: ROW_H }}
                    >
                      <EpicRowLabel
                        epic={epic}
                        progress={progress}
                        childrenCount={children.length}
                        open={children.length > 0 && !isCollapsed}
                        onToggle={() => toggleCollapsed(epic.id)}
                        onOpen={() => setOpenIssue(epic.id)}
                      />
                    </div>
                  );
                }

                const s = startPos ?? window_.today;
                const e2 = end ?? addDays(s, 13);
                const left = Math.max(differenceInCalendarDays(s, window_.min), 0) * dayW;
                const width = Math.max((differenceInCalendarDays(e2, s) + 1) * dayW, dayW * 5);

                return (
                  <div key={epic.id}>
                    <div
                      className={cn(
                        "relative flex border-b border-border/40 hover:bg-muted/20",
                        highlightIds.has(epic.id) && "bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
                      )}
                      style={{ height: ROW_H }}
                    >
                      <EpicRowLabel
                        epic={epic}
                        progress={progress}
                        childrenCount={children.length}
                        open={children.length > 0 && !isCollapsed}
                        onToggle={() => toggleCollapsed(epic.id)}
                        onOpen={() => setOpenIssue(epic.id)}
                      />
                      <div className="relative" style={{ width: timelineW }}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Epic ${epic.key}: ${epic.summary}, ${format(s, "MMM d")} to ${format(e2, "MMM d")}`}
                          className={cn(
                            "group absolute top-1/2 flex h-[26px] -translate-y-1/2 cursor-grab touch-none items-center overflow-hidden rounded-md border shadow-sm transition-shadow active:cursor-grabbing",
                            dragState ? "z-20 shadow-lg ring-2 ring-amber-500/50" : "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                            epic.status.category === "DONE" && "opacity-80"
                          )}
                          style={{
                            left,
                            width,
                            backgroundColor: hexAlpha(data.project.color, "2e"),
                            borderColor: hexAlpha(data.project.color, "88"),
                          }}
                          onPointerDown={(ev) => onBarPointerDown(ev, epic, "move")}
                          onPointerMove={onBarPointerMove}
                          onPointerUp={() => void onBarPointerUp(epic, { start: base.start ?? window_.today, end: base.end ?? addDays(base.start ?? window_.today, 13) })}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") setOpenIssue(epic.id);
                          }}
                        >
                          {/* progress fill */}
                          <div
                            className="absolute inset-y-0 left-0 transition-[width] duration-300"
                            style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: hexAlpha(data.project.color, "99") }}
                            aria-hidden
                          />
                          {/* resize handles */}
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                            style={{ backgroundColor: hexAlpha(data.project.color, "cc") }}
                            onPointerDown={(ev) => onBarPointerDown(ev, epic, "resize-l")}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={() => void onBarPointerUp(epic, { start: base.start ?? window_.today, end: base.end ?? addDays(base.start ?? window_.today, 13) })}
                          />
                          <span
                            aria-hidden
                            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                            style={{ backgroundColor: hexAlpha(data.project.color, "cc") }}
                            onPointerDown={(ev) => onBarPointerDown(ev, epic, "resize-r")}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={() => void onBarPointerUp(epic, { start: base.start ?? window_.today, end: base.end ?? addDays(base.start ?? window_.today, 13) })}
                          />
                          <span className="pointer-events-none relative z-[5] flex w-full items-center gap-1.5 px-2 text-[11px] font-semibold text-foreground">
                            <span className="shrink-0 opacity-70">{epic.key}</span>
                            <span className="truncate">{epic.summary}</span>
                            <span className="ml-auto hidden shrink-0 rounded bg-background/70 px-1 text-[9px] font-medium text-muted-foreground sm:inline">
                              {format(s, "MMM d")} → {format(e2, "MMM d")}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* children */}
                    {!isCollapsed &&
                      children.map((child) => (
                        <ChildRow
                          key={child.id}
                          child={child}
                          min={window_.min}
                          dayW={dayW}
                          labelW={LABEL_W}
                          timelineW={timelineW}
                          highlighted={highlightIds.has(child.id)}
                          onOpen={() => setOpenIssue(child.id)}
                        />
                      ))}
                  </div>
                );
              })}

              {/* ── Scheduled standalone stories (scope toggle) ── */}
              {showStories && stories.length > 0 && (
                <>
                  <div className="flex items-center border-t border-border bg-muted/40" style={{ height: STORY_DIVIDER_H }}>
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      style={{ width: LABEL_W, height: STORY_DIVIDER_H }}
                    >
                      <Layers className="size-3 text-amber-500" aria-hidden /> Scheduled issues
                      <span className="ml-auto rounded bg-muted px-1 text-[9px] font-bold tabular-nums text-muted-foreground">{stories.length}</span>
                    </div>
                    <div className="flex-1" />
                  </div>
                  {stories.map((st) => (
                    <StoryRow
                      key={st.id}
                      issue={st}
                      min={window_.min}
                      dayW={dayW}
                      labelW={LABEL_W}
                      timelineW={timelineW}
                      projectColor={data.project.color}
                      highlighted={highlightIds.has(st.id)}
                      onOpen={() => setOpenIssue(st.id)}
                    />
                  ))}
                </>
              )}
            </div>

            {/* ── Unscheduled epics ── */}
            {unscheduled.length > 0 && (
              <div className="border-t border-border bg-muted/30">
                <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Inbox className="size-3.5" aria-hidden /> Unscheduled — pick dates to map them
                </div>
                <ul className="space-y-1 px-3 pb-3">
                  {unscheduled.map(({ epic }) => (
                    <li key={epic.id} className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card px-2.5 py-1.5">
                      <IssueTypeIcon type={epic.type} size={13} />
                      <button
                        type="button"
                        onClick={() => setOpenIssue(epic.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                      >
                        <KeyBadge>{epic.key}</KeyBadge> {epic.summary}
                      </button>
                      <SchedulePopover epic={epic} onScheduled={applyIssue} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

/**
 * DependencyArrows — SVG overlay drawing link edges (§16) between roadmap bars.
 * Arrow: source bar right edge → target bar left edge (finish-to-start).
 * Color-coded by link type, with a card-colored halo for legibility over bars.
 */
function DependencyArrows({
  edges,
  layout,
  labelW,
  timelineW,
  issues,
  hoveredId,
  onHover,
}: {
  edges: IssueEdgeDTO[];
  layout: RowLayout;
  labelW: number;
  timelineW: number;
  issues: IssueDTO[];
  hoveredId: string | null;
  onHover: (edge: IssueEdgeDTO | null) => void;
}) {
  const byKey = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  const maxX = labelW + timelineW - 2;

  const paths = edges
    .map((edge) => {
      const from = layout.byId.get(edge.sourceId);
      const to = layout.byId.get(edge.targetId);
      if (!from || !to || !from.hasBar || !to.hasBar) return null;
      const src = byKey.get(edge.sourceId);
      const tgt = byKey.get(edge.targetId);
      if (!src || !tgt) return null;

      const x1 = Math.min(labelW + from.left + from.width, maxX);
      const y1 = from.top + from.height / 2;
      const x2 = Math.max(Math.min(labelW + to.left, maxX), labelW + 2);
      const y2 = to.top + to.height / 2;
      const gap = x2 - x1;
      // Control-point spread: wide gaps curve gently, overlaps still get a clean S.
      const k = Math.min(Math.max(Math.abs(gap) / 2, 26), 64);
      const d = `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
      return { edge, d, color: EDGE_COLORS[edge.type], label: `${src.key} ${edge.type.toLowerCase()} ${tgt.key}` };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-[6]"
      width={labelW + timelineW}
      height={layout.totalHeight}
      aria-hidden
    >
      <defs>
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <marker
            key={type}
            id={`edge-arrow-${type}`}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="5.5"
            markerHeight="5.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
          </marker>
        ))}
      </defs>
      {paths.map(({ edge, d, color, label }) => {
        const dimmed = hoveredId !== null && hoveredId !== edge.id;
        return (
          <g
            key={edge.id}
            className="pointer-events-auto cursor-pointer group/edge"
            onPointerEnter={() => onHover(edge)}
            onPointerLeave={() => onHover(null)}
            style={{ opacity: dimmed ? 0.22 : 1, transition: "opacity 150ms" }}
          >
            <title>{label}</title>
            {/* halo for legibility over bars */}
            <path d={d} fill="none" strokeWidth={4.5} className="stroke-card" strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              strokeWidth={1.75}
              stroke={color}
              strokeLinecap="round"
              markerEnd={`url(#edge-arrow-${edge.type})`}
              className="transition-[stroke-width] duration-150 group-hover/edge:stroke-[3]"
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}

function EpicRowLabel({
  epic,
  progress,
  childrenCount,
  open,
  onToggle,
  onOpen,
}: {
  epic: IssueDTO;
  progress: number;
  childrenCount: number;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-2.5"
      style={{ width: LABEL_W }}
    >
      {childrenCount > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${epic.key}` : `Expand ${epic.key}`}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
        </button>
      ) : (
        <span className="w-[19px]" aria-hidden />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        aria-label={`Open issue ${epic.key}`}
      >
        <IssueTypeIcon type={epic.type} size={13} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{epic.summary}</span>
      </button>
      {childrenCount > 0 && (
        <span
          className={cn(
            "shrink-0 rounded px-1 py-px text-[9px] font-bold tabular-nums",
            progress >= 1 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
          )}
        >
          {Math.round(progress * 100)}%
        </span>
      )}
    </div>
  );
}

/**
 * StoryRow — a scheduled standalone issue (non-epic, top-level) plotted on the
 * roadmap when the "Stories" scope toggle is on. Bar uses the project color.
 */
function StoryRow({
  issue,
  min,
  dayW,
  labelW,
  timelineW,
  projectColor,
  highlighted,
  onOpen,
}: {
  issue: IssueDTO;
  min: Date;
  dayW: number;
  labelW: number;
  timelineW: number;
  projectColor: string;
  highlighted?: boolean;
  onOpen: () => void;
}) {
  const done = issue.status.category === "DONE";
  const overdue = !done && issue.dueDate != null && toDay(issue.dueDate) < startOfDay(new Date());
  const geom = barGeom(issue, min, dayW, issue.dueDate ? toDay(issue.dueDate) : undefined);

  return (
    <div
      className={cn(
        "relative flex border-b border-border/30",
        highlighted && "bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
      )}
      style={{ height: CHILD_H }}
    >
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-2.5"
        style={{ width: labelW }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          aria-label={`Open issue ${issue.key}`}
        >
          <IssueTypeIcon type={issue.type} size={11} />
          <KeyBadge>{issue.key}</KeyBadge>
          <span className={cn("min-w-0 flex-1 truncate text-[11px]", done ? "text-muted-foreground/70 line-through" : "text-foreground/90")}>
            {issue.summary}
          </span>
        </button>
      </div>
      <div className="relative" style={{ width: timelineW }}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full border transition-shadow hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            done && "opacity-55"
          )}
          style={{
            left: geom.left,
            width: geom.width,
            backgroundColor: hexAlpha(projectColor, "59"),
            borderColor: hexAlpha(projectColor, "99"),
          }}
          aria-label={`${issue.key} ${issue.summary} roadmap bar`}
        >
          {overdue && (
            <span
              className="absolute -right-1 -top-1 size-2 rounded-full border border-card bg-rose-500"
              title="Overdue"
              aria-label="Overdue"
            />
          )}
          {issue.storyPoints != null && (
            <span className="absolute -right-1 -top-3 rounded bg-muted px-1 text-[8px] font-semibold text-muted-foreground">
              {issue.storyPoints}pt
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function ChildRow({
  child,
  min,
  dayW,
  labelW,
  timelineW,
  highlighted,
  onOpen,
}: {
  child: IssueDTO;
  min: Date;
  dayW: number;
  labelW: number;
  timelineW: number;
  highlighted?: boolean;
  onOpen: () => void;
}) {
  const done = child.status.category === "DONE";
  const start = child.startDate ? toDay(child.startDate) : toDay(child.createdAt);
  const due = child.dueDate ? toDay(child.dueDate) : null;
  const left = Math.max(differenceInCalendarDays(start, min), 0) * dayW;
  const width = due ? Math.max((differenceInCalendarDays(due, start) + 1) * dayW, dayW * 2) : dayW * 2;

  return (
    <div
      className={cn(
        "relative flex border-b border-border/30 bg-muted/20",
        highlighted && "bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
      )}
      style={{ height: 32 }}
    >
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-2.5 pl-8"
        style={{ width: labelW }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          aria-label={`Open issue ${child.key}`}
        >
          <IssueTypeIcon type={child.type} size={11} />
          <KeyBadge>{child.key}</KeyBadge>
          <span className={cn("min-w-0 flex-1 truncate text-[11px]", done ? "text-muted-foreground/70 line-through" : "text-foreground/90")}>
            {child.summary}
          </span>
        </button>
      </div>
      <div className="relative" style={{ width: timelineW }}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full border transition-shadow hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            done ? "border-emerald-500/60 bg-emerald-500/60" : "border-stone-400/70 bg-stone-400/50 dark:border-stone-500/70 dark:bg-stone-500/50"
          )}
          style={{ left, width }}
          aria-label={`${child.key} ${child.summary} timeline bar`}
        >
          {child.storyPoints != null && (
            <span className="absolute -right-1 -top-3 rounded bg-muted px-1 text-[8px] font-semibold text-muted-foreground">
              {child.storyPoints}pt
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function SprintBand({ sprint, min, dayW }: { sprint: SprintDTO; min: Date; dayW: number }) {
  const start = toDay(sprint.startDate!);
  const end = toDay(sprint.endDate!);
  const left = Math.max(differenceInCalendarDays(start, min), 0) * dayW;
  const width = Math.max((differenceInCalendarDays(end, start) + 1) * dayW, dayW * 3);
  const palette =
    sprint.status === "ACTIVE"
      ? "border-amber-500/60 bg-amber-500/25 text-amber-800 dark:text-amber-300"
      : sprint.status === "COMPLETED"
        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
        : "border-stone-400/50 bg-stone-400/20 text-stone-600 dark:text-stone-300";

  return (
    <div
      className={cn("absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-full border px-2.5", palette)}
      style={{ left, width }}
      title={`${sprint.name}: ${format(start, "MMM d")} – ${format(end, "MMM d")}`}
    >
      <span className="truncate text-[10px] font-semibold">{sprint.name}</span>
    </div>
  );
}

function SchedulePopover({
  epic,
  onScheduled,
}: {
  epic: IssueDTO;
  onScheduled: (i: IssueDTO) => void;
}) {
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function apply() {
    if (!start || !due) return;
    if (new Date(start) > new Date(due)) {
      toast.error("Start must be before due date");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchIssue(epic.id, {
        startDate: new Date(`${start}T12:00:00`).toISOString(),
        dueDate: new Date(`${due}T12:00:00`).toISOString(),
      });
      onScheduled(updated);
      toast.success(`${epic.key} scheduled`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 rounded-full px-2.5 text-[11px]">
          <Flag className="size-3" aria-hidden /> Schedule
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`sched-start-${epic.id}`} className="text-xs">Start date</Label>
          <Input id={`sched-start-${epic.id}`} type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sched-due-${epic.id}`} className="text-xs">Due date</Label>
          <Input id={`sched-due-${epic.id}`} type="date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} className="h-8" />
        </div>
        <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700" disabled={busy || !start || !due} onClick={() => void apply()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Put on roadmap
        </Button>
      </PopoverContent>
    </Popover>
  );
}
