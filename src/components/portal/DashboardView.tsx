"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlarmClock,
  ArrowLeftRight,
  AtSign,
  CalendarClock,
  CheckCheck,
  CircleDot,
  FolderPlus,
  ListTodo,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

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

function IssueRow({ issue }: { issue: IssueDTO }) {
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const dueSoon =
    issue.dueDate && !isOverdue(issue.dueDate) &&
    new Date(issue.dueDate).getTime() - Date.now() < 3 * 86_400_000;
  return (
    <button
      type="button"
      onClick={() => setOpenIssue(issue.id)}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:bg-stone-50"
    >
      <IssueTypeIcon type={issue.type} />
      <KeyBadge>{issue.key}</KeyBadge>
      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{issue.summary}</span>
      <PriorityIcon priority={issue.priority} />
      <StatusDot status={issue.status} />
      {issue.dueDate && (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded px-1.5 py-px text-[11px] sm:inline-flex",
            isOverdue(issue.dueDate)
              ? "bg-rose-100 text-rose-700"
              : dueSoon
                ? "bg-amber-100 text-amber-800"
                : "text-stone-400"
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
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-stone-800">{activity.user.name}</span>{" "}
        <span className="text-stone-500">{activity.type.split(".")[1]?.replace(/_/g, " ") ?? activity.type}</span>
        {activity.field && activity.oldValue != null && activity.newValue != null && (
          <span className="ml-1 text-stone-500">
            {activity.field}: <span className="text-stone-600">{activity.oldValue}</span>{" "}
            <span aria-hidden>→</span> <span className="font-medium text-stone-800">{activity.newValue}</span>
          </span>
        )}
        {activity.field && (activity.oldValue == null || activity.newValue == null) && (
          <span className="ml-1 text-stone-500">{activity.field}</span>
        )}
        <div className="mt-0.5">
          <RelativeTime date={activity.createdAt} className="text-[11px] text-stone-400" />
        </div>
      </div>
    </li>
  );
}

export function DashboardView() {
  const me = usePortalStore((s) => s.me);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
            {greeting}
            {me ? `, ${me.name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-stone-500">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden /> Refresh
        </Button>
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

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        {/* My Issues */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">My issues</CardTitle>
            <span className="text-xs text-stone-400">{data ? `${data.stats.myOpen} open` : ""}</span>
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

        {/* Active sprints */}
        <Card>
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
                  <div key={card.sprint.id} className="rounded-lg border border-stone-200 p-3 transition-colors hover:border-stone-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-stone-800">{card.sprint.name}</span>
                      <span className="shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                        {card.projectKey}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[11px] font-medium text-stone-500">{pct}%</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-stone-400">
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

        {/* Created vs resolved */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Created vs resolved</CardTitle>
            <p className="text-xs text-stone-400">Last 14 days</p>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12 }}
                      labelStyle={{ fontWeight: 600, color: "#1c1917" }}
                    />
                    <Area type="monotone" dataKey="created" name="Created" stroke="#d97706" strokeWidth={2} fill="url(#gCreated)" />
                    <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2} fill="url(#gResolved)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming due */}
        <Card>
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

        {/* Recent activity */}
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : !data || data.activity.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No activity yet" hint="Team actions will appear here as they happen." />
            ) : (
              <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
                {data.activity.map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
