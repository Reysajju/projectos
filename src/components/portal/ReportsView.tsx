"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PieChart as PieChartIcon, RefreshCw, TrendingDown, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useTheme } from "next-themes";

import { api } from "@/lib/api-client";
import type { BurndownPayload, OverviewPayload, SprintDTO, VelocityPayload } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { useProjectData } from "./project-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_COLORS = ["#d97706", "#059669", "#7c3aed", "#e11d48", "#ea580c", "#0d9488", "#57534e", "#65a30d"];

const TICK_LIGHT = "#78716c";
const TICK_DARK = "#a8a29e";

function tooltipStyle(dark: boolean) {
  return {
    borderRadius: 8,
    border: dark ? "1px solid #44403c" : "1px solid #e7e5e4",
    fontSize: 12,
    backgroundColor: dark ? "#1c1917" : "#ffffff",
    color: dark ? "#fafaf9" : "#1c1917",
  } as const;
}

function ChartCard({
  title,
  hint,
  children,
  className,
  loading,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
        </div>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground/80" aria-hidden />}
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ height: 280 }}>{children}</div>
      </CardContent>
    </Card>
  );
}

export function ReportsView() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const tick = dark ? TICK_DARK : TICK_LIGHT;
  const grid = dark ? "#44403c" : "#e7e5e4";
  const cursor = dark ? "#292524" : "#f5f5f4";
  const tip = tooltipStyle(dark);
  const { data } = useProjectData();
  const projectId = data?.project.id ?? "";

  const [sprintId, setSprintId] = useState<string>("");
  const [burndown, setBurndown] = useState<BurndownPayload | null>(null);
  const [velocity, setVelocity] = useState<VelocityPayload | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loadingBd, setLoadingBd] = useState(false);
  const [loadingVel, setLoadingVel] = useState(false);
  const [loadingOv, setLoadingOv] = useState(false);

  const sprints: SprintDTO[] = data?.sprints ?? [];
  const selectableSprints = useMemo(
    () =>
      [...sprints]
        .filter((s) => s.status !== "FUTURE")
        .sort((a, b) => {
          const rank = (s: SprintDTO) => (s.status === "ACTIVE" ? 0 : 1);
          return rank(a) - rank(b) || a.order - b.order;
        }),
    [sprints]
  );

  // Default sprint: first ACTIVE, else first non-future
  useEffect(() => {
    if (!selectableSprints.length) {
      setSprintId("");
      return;
    }
    if (!selectableSprints.some((s) => s.id === sprintId)) {
      setSprintId(selectableSprints[0].id);
    }
  }, [selectableSprints, sprintId]);

  const loadBurndown = useCallback(async () => {
    if (!sprintId) {
      setBurndown(null);
      return;
    }
    setLoadingBd(true);
    try {
      setBurndown(await api.burndown(sprintId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load burndown");
      setBurndown(null);
    } finally {
      setLoadingBd(false);
    }
  }, [sprintId]);

  const loadVelocity = useCallback(async () => {
    if (!projectId) return;
    setLoadingVel(true);
    try {
      setVelocity(await api.velocity(projectId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load velocity");
      setVelocity(null);
    } finally {
      setLoadingVel(false);
    }
  }, [projectId]);

  const loadOverview = useCallback(async () => {
    if (!projectId) return;
    setLoadingOv(true);
    try {
      setOverview(await api.overview(projectId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load overview");
      setOverview(null);
    } finally {
      setLoadingOv(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadBurndown();
  }, [loadBurndown]);
  useEffect(() => {
    void loadVelocity();
  }, [loadVelocity]);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  function refreshAll() {
    void loadBurndown();
    void loadVelocity();
    void loadOverview();
  }

  const activeSprint = selectableSprints.find((s) => s.id === sprintId);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Reports</h2>
          <p className="text-xs text-muted-foreground">Sprint analytics for {data?.project.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sprintId || undefined} onValueChange={setSprintId}>
            <SelectTrigger size="sm" className="w-48" aria-label="Sprint for burndown">
              <SelectValue placeholder={selectableSprints.length ? "Pick sprint" : "No sprints yet"} />
            </SelectTrigger>
            <SelectContent>
              {selectableSprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "ACTIVE" ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshAll}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </Button>
        </div>
      </div>

      {/* Burndown */}
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <ChartCard
          title="Burndown"
          hint={activeSprint ? `${activeSprint.name} — remaining vs ideal story points` : "Select a sprint"}
          loading={loadingBd}
          className="min-w-0 lg:col-span-2"
        >
          {burndown && burndown.points.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndown.points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} labelStyle={{ fontWeight: 600, color: dark ? "#fafaf9" : "#1c1917" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#d97706" strokeWidth={2.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <TrendingDown className="size-6 text-stone-300" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {sprints.length === 0 ? "Create and start a sprint to see its burndown." : "No data for this sprint yet."}
              </p>
            </div>
          )}
        </ChartCard>

        {/* Velocity */}
        <ChartCard title="Velocity" hint="Committed vs completed story points" loading={loadingVel}>
          {velocity && velocity.sprints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity.sprints} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: tick }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} labelStyle={{ fontWeight: 600, color: dark ? "#fafaf9" : "#1c1917" }} cursor={{ fill: cursor }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="committed" name="Committed" fill={dark ? "#44403c" : "#e7e5e4"} radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Zap className="size-6 text-stone-300" aria-hidden />
              <p className="text-sm text-muted-foreground">Complete sprints to build a velocity trend.</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Distributions */}
      <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Status" hint="Issues per status" loading={loadingOv}>
          {overview && overview.statusDist.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={overview.statusDist} dataKey="count" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {overview.statusDist.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Priority" hint="Issues per priority" loading={loadingOv}>
          {overview && overview.priorityDist.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.priorityDist} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: cursor }} />
                <Bar dataKey="count" name="Issues" radius={[0, 4, 4, 0]}>
                  {overview.priorityDist.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Team workload" hint="Open vs done per member" loading={loadingOv}>
          {overview && overview.assigneeLoad.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.assigneeLoad} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: tick }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: cursor }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="open" name="Open" fill="#d97706" radius={[0, 3, 3, 0]} />
                <Bar dataKey="done" name="Done" fill="#059669" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Type" hint="Issues per type" loading={loadingOv}>
          {overview && overview.typeDist.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={overview.typeDist} dataKey="count" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {overview.typeDist.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* Project stats summary */}
      {data && (
        <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground")}>
          <span className="flex items-center gap-1.5 font-medium text-foreground/90">
            <PieChartIcon className="size-3.5" aria-hidden /> Snapshot
          </span>
          <span>{data.stats.total} issues</span>
          <span>{data.stats.todo} to do</span>
          <span>{data.stats.inProgress} in progress</span>
          <span>{data.stats.done} done</span>
          <span>{data.stats.donePoints}/{data.stats.points} pts</span>
          {data.stats.overdue > 0 && <span className="font-medium text-rose-600">{data.stats.overdue} overdue</span>}
        </div>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center">
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}
