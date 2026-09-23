"use client";

/**
 * Dashboard (blueprint §6) with per-user widget customization:
 * visibility + drag-reorderable ordering persisted server-side via
 * /api/preferences (key "dashboard.widgets"), so the layout follows
 * the user across devices.
 */

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useTheme } from "next-themes";
import {
  AlarmClock,
  ArrowLeftRight,
  AtSign,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleDot,
  FolderPlus,
  GripVertical,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { DashboardPayload, IssueDTO, ActivityDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { PriorityIcon } from "./PriorityIcon";
import { isOverdue, RelativeTime, formatDateShort } from "./RelativeTime";
import { StatCard } from "./StatCard";
import { StatusDot } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  "issue.created": Plus,
  "issue.updated": RefreshCw,
  "issue.status_changed": ArrowLeftRight,
  "issue.assigned": UserPlus,
  "comment.created": MessageSquare,
  "sprint.started": PlayCircle,
  "sprint.completed": CheckCheck,
  "project.created": FolderPlus,
  "member.joined": UserPlus,
  mentioned: AtSign,
};

// ─── Widget registry (order = default layout order) ─────────────

interface WidgetDef {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Tailwind grid span on the lg 3-col grid. */
  span: string;
}

const WIDGETS: WidgetDef[] = [
  { id: "my-issues", title: "My issues", icon: ListTodo, span: "lg:col-span-2" },
  { id: "active-sprints", title: "Active sprints", icon: PlayCircle, span: "" },
  { id: "created-vs-resolved", title: "Created vs resolved", icon: RefreshCw, span: "lg:col-span-2" },
  { id: "upcoming-due", title: "Upcoming due", icon: AlarmClock, span: "" },
  { id: "activity", title: "Recent activity", icon: MessageSquare, span: "lg:col-span-3" },
];

const WIDGETS_PREF_KEY = "dashboard.widgets";

interface WidgetPrefs {
  order: string[];
  hidden: string[];
}

const DEFAULT_PREFS: WidgetPrefs = { order: WIDGETS.map((w) => w.id), hidden: [] };

function IssueRow({ issue }: { issue: IssueDTO }) {
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const dueSoon =
    issue.dueDate && !isOverdue(issue.dueDate) &&
    new Date(issue.dueDate).getTime() - Date.now() < 3 * 86_400_000;
  return (
    <button
      type="button"
      onClick={() => setOpenIssue(issue.id)}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50"
    >
      <IssueTypeIcon type={issue.type} />
      <KeyBadge>{issue.key}</KeyBadge>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{issue.summary}</span>
      <PriorityIcon priority={issue.priority} />
      <StatusDot status={issue.status} />
      {issue.dueDate && (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded px-1.5 py-px text-[11px] sm:inline-flex",
            isOverdue(issue.dueDate)
              ? "bg-rose-100 text-rose-700"
              : dueSoon
                ? "bg-amber-100 text-amber-600"
                : "text-muted-foreground/80"
          )}
        >
          <CalendarClock className="size-3" aria-hidden />
          {formatDateShort(issue.dueDate)}
        </span>
      )}
    </button>
  );
}

function ActivityItem({ activity }: { activity: ActivityDTO }) {
  const Icon = ACTIVITY_ICONS[activity.type] ?? CircleDot;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-foreground">{activity.user.name}</span>{" "}
        <span className="text-muted-foreground">{activity.type.split(".")[1]?.replace(/_/g, " ") ?? activity.type}</span>
        {activity.field && activity.oldValue != null && activity.newValue != null && (
          <span className="ml-1 text-muted-foreground">
            {activity.field}: <span className="text-muted-foreground">{activity.oldValue}</span>{" "}
            <span aria-hidden>→</span> <span className="font-medium text-foreground">{activity.newValue}</span>
          </span>
        )}
        {activity.field && (activity.oldValue == null || activity.newValue == null) && (
          <span className="ml-1 text-muted-foreground">{activity.field}</span>
        )}
        <div className="mt-0.5">
          <RelativeTime date={activity.createdAt} className="text-[11px] text-muted-foreground/80" />
        </div>
      </div>
    </li>
  );
}

// ─── Customize popover ──────────────────────────────────────────

function SortableWidgetRow({
  widget,
  visible,
  onToggle,
  onMove,
  isFirst,
  isLast,
}: {
  widget: WidgetDef;
  visible: boolean;
  onToggle: (v: boolean) => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const Icon = widget.icon;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        isDragging ? "z-10 bg-muted shadow-md ring-1 ring-border" : "hover:bg-muted/60",
        !visible && "opacity-55"
      )}
    >
      <button
        type="button"
        className="touch-none rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        aria-label={`Reorder ${widget.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{widget.title}</span>
      <span className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={`Move ${widget.title} up`}
          disabled={isFirst}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(-1)}
        >
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move ${widget.title} down`}
          disabled={isLast}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(1)}
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </span>
      <Switch
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`${visible ? "Hide" : "Show"} ${widget.title}`}
      />
    </li>
  );
}

function CustomizeWidgets({
  prefs,
  onChange,
}: {
  prefs: WidgetPrefs;
  onChange: (next: WidgetPrefs) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ordered = prefs.order
    .map((id) => WIDGETS.find((w) => w.id === id))
    .filter((w): w is WidgetDef => w !== undefined);

  function toggle(id: string, visible: boolean) {
    const hidden = visible
      ? prefs.hidden.filter((h) => h !== id)
      : [...prefs.hidden, id];
    onChange({ ...prefs, hidden });
  }

  function move(id: string, dir: -1 | 1) {
    const order = [...prefs.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...prefs, order });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onChange({ ...prefs, order: arrayMove(prefs.order, prefs.order.indexOf(String(active.id)), prefs.order.indexOf(String(over.id))) });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          Dashboard widgets
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-0.5">
              {ordered.map((w, idx) => (
                <SortableWidgetRow
                  key={w.id}
                  widget={w}
                  visible={!prefs.hidden.includes(w.id)}
                  onToggle={(v) => toggle(w.id, v)}
                  onMove={(dir) => move(w.id, dir)}
                  isFirst={idx === 0}
                  isLast={idx === ordered.length - 1}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <p className="px-2 pb-1 pt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
          Drag to reorder · layout is saved to your account and follows you across devices.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main view ──────────────────────────────────────────────────

export function DashboardView() {
  const me = usePortalStore((s) => s.me);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<WidgetPrefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.dashboard();
      setData(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Load widget prefs (best-effort — fall back to defaults).
    api
      .getPreferences()
      .then((p) => {
        const raw = p[WIDGETS_PREF_KEY];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const rec = raw as Partial<WidgetPrefs>;
          const validIds = new Set(WIDGETS.map((w) => w.id));
          const order = Array.isArray(rec.order)
            ? rec.order.filter((id): id is string => typeof id === "string" && validIds.has(id))
            : DEFAULT_PREFS.order;
          // Keep any widgets missing from the stored order (registry growth).
          for (const w of WIDGETS) if (!order.includes(w.id)) order.push(w.id);
          const hidden = Array.isArray(rec.hidden)
            ? rec.hidden.filter((id): id is string => typeof id === "string" && validIds.has(id))
            : [];
          setPrefs({ order, hidden });
        }
      })
      .catch(() => undefined)
      .finally(() => setPrefsReady(true));
  }, [load]);

  function updatePrefs(next: WidgetPrefs) {
    setPrefs(next);
    void api.setPreference(WIDGETS_PREF_KEY, next).catch(() => {
      toast.error("Couldn't save layout");
    });
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Resolve the effective widget order once prefs are ready.
  const orderedWidgets = prefs.order
    .map((id) => WIDGETS.find((w) => w.id === id))
    .filter((w): w is WidgetDef => w !== undefined && !prefs.hidden.includes(w.id));

  function renderWidget(id: string) {
    switch (id) {
      case "my-issues":
        return (
          <Card className="min-w-0 lg:col-span-2" key={id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">My issues</CardTitle>
              <span className="text-xs text-muted-foreground/80">{data ? `${data.stats.myOpen} open` : ""}</span>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
              ) : !data || data.myIssues.length === 0 ? (
                <EmptyState icon={CheckCheck} title="Nothing assigned to you" hint="Issues assigned to you that aren't done will show up here." />
              ) : (
                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
                  {data.myIssues.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "active-sprints":
        return (
          <Card key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active sprints</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)
              ) : !data || data.activeSprintCards.length === 0 ? (
                <EmptyState icon={PlayCircle} title="No active sprints" hint="Start a sprint from a project's backlog to see progress here." />
              ) : (
                data.activeSprintCards.map((card) => {
                  const pct = card.total > 0 ? Math.round((card.done / card.total) * 100) : 0;
                  return (
                    <div key={card.sprint.id} className="rounded-lg border border-border p-3 transition-colors hover:border-border">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{card.sprint.name}</span>
                        <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                          {card.projectKey}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-[11px] font-medium text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/80">
                        <span>{card.done}/{card.total} issues</span>
                        <span>{card.donePoints}/{card.points} pts</span>
                        {card.sprint.endDate && <span className="ml-auto">ends {formatDateShort(card.sprint.endDate)}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      case "created-vs-resolved":
        return (
          <Card className="min-w-0 lg:col-span-2" key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Created vs resolved</CardTitle>
              <p className="text-xs text-muted-foreground/80">Last 14 days</p>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <Skeleton className="h-[260px]" />
              ) : !data || data.createdVsResolved.length === 0 ? (
                <EmptyState icon={ListTodo} title="No activity yet" hint="Create issues to see throughput." />
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.createdVsResolved} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d97706" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#44403c" : "#e7e5e4"} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: dark ? "#a8a29e" : "#78716c" }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: dark ? "#a8a29e" : "#78716c" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: dark ? "1px solid #44403c" : "1px solid #e7e5e4",
                          fontSize: 12,
                          backgroundColor: dark ? "#1c1917" : "#ffffff",
                          color: dark ? "#fafaf9" : "#1c1917",
                        }}
                        labelStyle={{ fontWeight: 600, color: dark ? "#fafaf9" : "#1c1917" }}
                      />
                      <Area type="monotone" dataKey="created" name="Created" stroke="#d97706" strokeWidth={2} fill="url(#gCreated)" />
                      <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2} fill="url(#gResolved)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "upcoming-due":
        return (
          <Card key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlarmClock className="size-4 text-amber-600" aria-hidden /> Upcoming due
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : !data || data.upcomingDue.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No due dates" hint="Issues assigned to you with upcoming due dates appear here." />
              ) : (
                <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
                  {data.upcomingDue.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "activity":
        return (
          <Card className="min-w-0 lg:col-span-3" key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
              ) : !data || data.activity.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No activity yet" hint="Team actions will appear here as they happen." />
              ) : (
                <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5 dark:divide-stone-800">
                  {data.activity.map((a) => (
                    <ActivityItem key={a.id} activity={a} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <LayoutDashboard className="size-5 text-amber-600 sm:hidden" aria-hidden />
            {greeting}
            {me ? `, ${me.name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <CustomizeWidgets prefs={prefs} onChange={updatePrefs} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden /> Refresh
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-lg" />)
          : (
              <>
                <StatCard icon={CircleDot} label="My open issues" value={data.stats.myOpen} tint="amber" />
                <StatCard icon={ListTodo} label="Open issues" value={data.stats.openIssues} tint="stone" hint={`${data.stats.totalIssues} total`} />
                <StatCard icon={CheckCheck} label="Completed this week" value={data.stats.completedThisWeek} tint="emerald" />
                <StatCard icon={Zap} label="Active sprints" value={data.stats.activeSprints} tint="violet" />
              </>
            )}
      </div>

      {/* Widgets (order + visibility are per-user) */}
      <div className="grid gap-4 [grid-auto-flow:dense] [&>*]:min-w-0 lg:grid-cols-3">
        {prefsReady ? orderedWidgets.map((w) => renderWidget(w.id)) : WIDGETS.map((w) => renderWidget(w.id))}
      </div>

    </div>
  );
}
