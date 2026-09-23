"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { format } from "date-fns";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, SprintDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { IssueCardBody } from "./IssueCard";
import { useProjectData } from "./project-data";
import { formatDateShort } from "./RelativeTime";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Sprint dialog (create / edit / start) ──────────────────────

function SprintDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start font-normal" aria-label={label}>
            <CalendarRange className="size-4 text-muted-foreground/80" aria-hidden />
            {value ? format(value, "MMM d, yyyy") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SprintDialog({
  open,
  onOpenChange,
  projectId,
  sprint,
  mode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  sprint?: SprintDTO | null;
  mode: "create" | "edit" | "start";
  onSaved?: (s: SprintDTO) => void;
}) {
  const { applySprint, data: pd } = useProjectData();
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState<Date | undefined>(new Date());
  const [end, setEnd] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (open && !initialized) {
    setInitialized(true);
    if (sprint) {
      setName(sprint.name);
      setGoal(sprint.goal ?? "");
      setStart(sprint.startDate ? new Date(sprint.startDate) : undefined);
      setEnd(sprint.endDate ? new Date(sprint.endDate) : undefined);
    } else {
      const existingCount = pd?.sprints.length ?? 0;
      setName(mode === "create" ? `Sprint ${existingCount + 1}` : "");
      setGoal("");
      setStart(mode === "start" ? new Date() : undefined);
      setEnd(mode === "start" ? new Date(Date.now() + 14 * 86_400_000) : undefined);
    }
  }
  if (!open && initialized) setInitialized(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Sprint name is required");
      return;
    }
    setBusy(true);
    try {
      let saved: SprintDTO;
      if (mode === "create") {
        saved = await api.createSprint({
          projectId,
          name: name.trim(),
          goal: goal.trim() || undefined,
          startDate: start ? start.toISOString() : undefined,
          endDate: end ? end.toISOString() : undefined,
        });
        toast.success(`Sprint “${saved.name}” created`);
      } else if (mode === "start") {
        saved = await api.patchSprint(sprint!.id, {
          status: "ACTIVE",
          startDate: start ? start.toISOString() : null,
          endDate: end ? end.toISOString() : null,
        });
        toast.success(`Sprint “${saved.name}” started`);
      } else {
        saved = await api.patchSprint(sprint!.id, {
          name: name.trim(),
          goal: goal.trim() || null,
          startDate: start ? start.toISOString() : null,
          endDate: end ? end.toISOString() : null,
        });
        toast.success("Sprint updated");
      }
      applySprint(saved);
      await refreshWorkspace();
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sprint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create sprint" : mode === "start" ? `Start ${sprint?.name}` : "Edit sprint"}
          </DialogTitle>
          <DialogDescription>
            {mode === "start"
              ? "Set the sprint window. Only one sprint can be active per project."
              : "Sprints group issues into time-boxed iterations."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Name</Label>
            <Input
              id="sprint-name"
              required
              placeholder="Sprint 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Goal</Label>
            <Input
              id="sprint-goal"
              placeholder="What should this sprint achieve?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SprintDateField label="Start date" value={start} onChange={setStart} />
            <SprintDateField label="End date" value={end} onChange={setEnd} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-amber-600 text-white hover:bg-amber-700">
              {mode === "start" ? "Start sprint" : mode === "create" ? "Create sprint" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteSprintDialog({
  sprint,
  issues,
  open,
  onOpenChange,
}: {
  sprint: SprintDTO;
  issues: IssueDTO[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { applySprint, refetch } = useProjectData();
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [busy, setBusy] = useState(false);
  const unfinished = issues.filter((i) => i.status.category !== "DONE");

  async function complete() {
    setBusy(true);
    try {
      const saved = await api.patchSprint(sprint.id, { status: "COMPLETED" });
      applySprint(saved);
      toast.success(
        `Sprint completed · ${issues.length - unfinished.length} done, ${unfinished.length} moved to backlog`
      );
      await refreshWorkspace();
      onOpenChange(false);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete sprint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {sprint.name}?</DialogTitle>
          <DialogDescription>
            {issues.length - unfinished.length} issue
            {issues.length - unfinished.length === 1 ? "" : "s"} are done and will stay in the sprint.
            {unfinished.length > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground/90">
                  {unfinished.length} unfinished issue{unfinished.length === 1 ? "" : "s"}
                </span>{" "}
                will move back to the backlog.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void complete()} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden /> Complete sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Drag pieces ────────────────────────────────────────────────

function BacklogCard({ issue, onOpenIssue }: { issue: IssueDTO; onOpenIssue: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const downPos = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDownCapture={(e) => downPos.current = { x: e.clientX, y: e.clientY }}
      onClick={(e) => {
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
      className={cn(
        "touch-none cursor-grab rounded-lg active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        isDragging && "opacity-40"
      )}
    >
      <IssueCardBody issue={issue} />
    </div>
  );
}

function DropSection({
  dropId,
  children,
  className,
}: {
  dropId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isOver && "ring-2 ring-inset ring-amber-500/40 rounded-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────

export function BacklogView() {
  const { data, applyIssue, addIssue, removeSprint, refetch } = useProjectData();
  const workspace = usePortalStore((s) => s.workspace);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [sprintDialog, setSprintDialog] = useState<
    { mode: "create" } | { mode: "edit" | "start"; sprint: SprintDTO } | null
  >(null);
  const [completeSprint, setCompleteSprint] = useState<SprintDTO | null>(null);
  const [deleteSprintTarget, setDeleteSprintTarget] = useState<SprintDTO | null>(null);

  // inline create row
  const [inlineSummary, setInlineSummary] = useState("");
  const [inlineTypeId, setInlineTypeId] = useState<string>("");
  const [inlineBusy, setInlineBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const project = data?.project;
  const issues = data?.issues ?? [];
  const sprints = data?.sprints ?? [];
  const types = workspace?.issueTypes ?? [];

  const activeSprints = useMemo(
    () => sprints.filter((s) => s.status === "ACTIVE").sort((a, b) => a.order - b.order),
    [sprints]
  );
  const futureSprints = useMemo(
    () => sprints.filter((s) => s.status === "FUTURE").sort((a, b) => a.order - b.order),
    [sprints]
  );
  const completedSprints = useMemo(
    () => sprints.filter((s) => s.status === "COMPLETED").sort((a, b) => a.order - b.order),
    [sprints]
  );

  const sprintIssues = useMemo(() => {
    const map = new Map<string, IssueDTO[]>();
    for (const s of sprints) map.set(s.id, []);
    const backlog: IssueDTO[] = [];
    for (const i of issues) {
      if (i.sprintId && map.has(i.sprintId)) map.get(i.sprintId)!.push(i);
      else if (!i.sprintId) backlog.push(i);
    }
    const cmp = (a: IssueDTO, b: IssueDTO) => a.order - b.order;
    for (const list of map.values()) list.sort(cmp);
    backlog.sort(cmp);
    return { map, backlog };
  }, [issues, sprints]);

  const activeIssue = activeIssueId ? issues.find((i) => i.id === activeIssueId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveIssueId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    setActiveIssueId(null);
    if (!e.over) return;
    const issue = issues.find((i) => i.id === activeId);
    if (!issue) return;

    const overId = String(e.over.id);
    let targetSprintId: string | null;
    let targetLabel: string;
    if (overId === "backlog") {
      targetSprintId = null;
      targetLabel = "backlog";
    } else if (overId.startsWith("sprint:")) {
      targetSprintId = overId.slice(7);
      const sprint = sprints.find((s) => s.id === targetSprintId);
      if (!sprint) return;
      if (sprint.status === "COMPLETED") {
        toast.error("Can't move issues into a completed sprint");
        return;
      }
      targetLabel = sprint.name;
    } else {
      return;
    }

    if (issue.sprintId === targetSprintId) return;

    // Optimistic
    applyIssue({ ...issue, sprintId: targetSprintId });

    try {
      const updated = await api.patchIssue(issue.id, { sprintId: targetSprintId });
      applyIssue(updated);
      toast.success(`${issue.key} moved to ${targetLabel}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move issue");
      void refetch();
    }
  }

  async function submitInline(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !inlineSummary.trim() || !inlineTypeId) return;
    setInlineBusy(true);
    try {
      const created = await api.createIssue({
        projectId: project.id,
        typeId: inlineTypeId,
        summary: inlineSummary.trim(),
      });
      addIssue(created);
      setInlineSummary("");
      toast.success(`${created.key} added to backlog`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setInlineBusy(false);
    }
  }

  async function deleteSprintNow(sprint: SprintDTO) {
    try {
      await api.deleteSprint(sprint.id);
      removeSprint(sprint.id);
      toast.success(`Sprint “${sprint.name}” deleted — its issues moved to the backlog`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete sprint");
    }
  }

  if (!data || !project) return null;

  const sprintSection = (sprint: SprintDTO, issuesIn: IssueDTO[]) => {
    const isCollapsed = collapsed[sprint.id] ?? false;
    const points = issuesIn.reduce((acc, i) => acc + (i.storyPoints ?? 0), 0);
    const donePoints = issuesIn.reduce((acc, i) => (i.status.category === "DONE" ? acc + (i.storyPoints ?? 0) : acc), 0);
    return (
      <DropSection key={sprint.id} dropId={`sprint:${sprint.id}`} className="rounded-lg">
        <section className="rounded-lg border border-border bg-card">
          <header className="flex flex-wrap items-center gap-2 px-4 py-3">
            <button
              type="button"
              aria-label={isCollapsed ? `Expand ${sprint.name}` : `Collapse ${sprint.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((c) => ({ ...c, [sprint.id]: !isCollapsed }))}
              className="rounded p-0.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              {isCollapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            </button>
            <h3 className="text-sm font-semibold text-foreground">{sprint.name}</h3>
            <span
              className={cn(
                "rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                sprint.status === "ACTIVE"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {sprint.status}
            </span>
            {(sprint.startDate || sprint.endDate) && (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground/80 sm:flex">
                <CalendarRange className="size-3" aria-hidden />
                {formatDateShort(sprint.startDate)} – {formatDateShort(sprint.endDate)}
              </span>
            )}
            {isCollapsed && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/80">
                <ListChecks className="size-3" aria-hidden /> {issuesIn.length}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground/80">
              {donePoints}/{points} pts · {issuesIn.length} issue{issuesIn.length === 1 ? "" : "s"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Sprint ${sprint.name} actions`}>
                  <Ellipsis className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {sprint.status === "FUTURE" && (
                  <DropdownMenuItem onSelect={() => setSprintDialog({ mode: "start", sprint })}>
                    <Play className="size-4" aria-hidden /> Start sprint
                  </DropdownMenuItem>
                )}
                {sprint.status === "ACTIVE" && (
                  <DropdownMenuItem onSelect={() => setCompleteSprint(sprint)}>
                    <CheckCircle2 className="size-4" aria-hidden /> Complete sprint
                  </DropdownMenuItem>
                )}
                {sprint.status !== "COMPLETED" && (
                  <DropdownMenuItem onSelect={() => setSprintDialog({ mode: "edit", sprint })}>
                    <Pencil className="size-4" aria-hidden /> Edit sprint
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteSprintTarget(sprint)}>
                  <Trash2 className="size-4" aria-hidden /> Delete sprint
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {sprint.goal && !isCollapsed && (
            <p className="px-4 pb-2 text-xs text-muted-foreground">🎯 {sprint.goal}</p>
          )}
          {!isCollapsed && (
            <div className="max-h-[420px] space-y-2 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
              {issuesIn.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground/80">
                  Drag issues here from the backlog
                </p>
              ) : (
                issuesIn.map((issue) => (
                  <BacklogCard key={issue.id} issue={issue} onOpenIssue={setOpenIssue} />
                ))
              )}
            </div>
          )}
        </section>
      </DropSection>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Backlog & sprints</h2>
          <p className="text-xs text-muted-foreground">
            Drag issues between the backlog and sprints to plan iterations.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setSprintDialog({ mode: "create" })}
        >
          <Plus className="size-3.5" aria-hidden /> Create sprint
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveIssueId(null)}
      >
        <div className="space-y-4">
          {activeSprints.map((s) => sprintSection(s, sprintIssues.map.get(s.id) ?? []))}
          {futureSprints.map((s) => sprintSection(s, sprintIssues.map.get(s.id) ?? []))}

          {/* Backlog section */}
          <DropSection dropId="backlog" className="rounded-lg">
            <section className="rounded-lg border border-border bg-card">
              <header className="flex items-center gap-2 px-4 py-3">
                <Square className="size-3.5 text-muted-foreground/80" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">Backlog</h3>
                <span className="text-xs text-muted-foreground/80">
                  {sprintIssues.backlog.length} issue{sprintIssues.backlog.length === 1 ? "" : "s"}
                </span>
              </header>

              {/* Inline create row */}
              {project.archived ? (
                <p className="mx-4 mb-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  This project is archived — read-only.
                </p>
              ) : (
                <form onSubmit={submitInline} className="mx-4 mb-3 flex flex-wrap items-center gap-2">
                  <Select value={inlineTypeId || undefined} onValueChange={setInlineTypeId}>
                    <SelectTrigger size="sm" className="h-8 w-36 shrink-0" aria-label="Issue type">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <IssueTypeIcon type={t} size={12} /> {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 flex-1"
                    placeholder="What needs to be done? Press Enter to add…"
                    aria-label="New backlog issue summary"
                    value={inlineSummary}
                    onChange={(e) => setInlineSummary(e.target.value)}
                    disabled={inlineBusy}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="h-8 gap-1"
                    disabled={inlineBusy || !inlineSummary.trim() || !inlineTypeId}
                  >
                    <Plus className="size-3.5" aria-hidden /> Add
                  </Button>
                </form>
              )}

              <div className="max-h-[520px] space-y-2 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
                {sprintIssues.backlog.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground/80">
                    Backlog is empty — add an issue above or drag one out of a sprint.
                  </p>
                ) : (
                  sprintIssues.backlog.map((issue) => (
                    <BacklogCard key={issue.id} issue={issue} onOpenIssue={setOpenIssue} />
                  ))
                )}
              </div>
            </section>
          </DropSection>

          {/* Completed sprints (read-only) */}
          {completedSprints.length > 0 && (
            <section className="rounded-lg border border-border bg-muted/50">
              <header className="flex items-center gap-2 px-4 py-3">
                <Zap className="size-3.5 text-emerald-600" aria-hidden />
                <h3 className="text-sm font-semibold text-muted-foreground">Completed sprints</h3>
              </header>
              <div className="space-y-1.5 px-4 pb-4">
                {completedSprints.map((s) => {
                  const list = sprintIssues.map.get(s.id) ?? [];
                  const done = list.filter((i) => i.status.category === "DONE").length;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/90">{s.name}</span>
                      <span className="text-muted-foreground/80">
                        {done}/{list.length} done
                      </span>
                      <span className="ml-auto">{formatDateShort(s.endDate)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activeIssue ? (
            <div className="w-[300px] cursor-grabbing">
              <IssueCardBody issue={activeIssue} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Sprint dialogs */}
      {sprintDialog?.mode === "create" && (
        <SprintDialog
          open
          mode="create"
          projectId={project.id}
          onOpenChange={(o) => !o && setSprintDialog(null)}
        />
      )}
      {sprintDialog?.mode === "edit" && (
        <SprintDialog
          open
          mode="edit"
          projectId={project.id}
          sprint={sprintDialog.sprint}
          onOpenChange={(o) => !o && setSprintDialog(null)}
        />
      )}
      {sprintDialog?.mode === "start" && (
        <SprintDialog
          open
          mode="start"
          projectId={project.id}
          sprint={sprintDialog.sprint}
          onOpenChange={(o) => !o && setSprintDialog(null)}
        />
      )}
      {completeSprint && (
        <CompleteSprintDialog
          sprint={completeSprint}
          issues={sprintIssues.map.get(completeSprint.id) ?? []}
          open
          onOpenChange={(o) => !o && setCompleteSprint(null)}
        />
      )}

      {/* Delete sprint confirm */}
      <Dialog open={deleteSprintTarget !== null} onOpenChange={(o) => !o && setDeleteSprintTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteSprintTarget?.name}?</DialogTitle>
            <DialogDescription>
              The sprint will be removed. Its {sprintIssues.map.get(deleteSprintTarget?.id ?? "")?.length ?? 0} issue
              {sprintIssues.map.get(deleteSprintTarget?.id ?? "")?.length === 1 ? "" : "s"} will move back to the
              backlog.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSprintTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteSprintTarget) void deleteSprintNow(deleteSprintTarget);
                setDeleteSprintTarget(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Delete sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
