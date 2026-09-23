"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function CreateIssueDialog() {
  const ctx = usePortalStore((s) => s.createIssue);
  const closeCreateIssue = usePortalStore((s) => s.closeCreateIssue);
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const openIssue = usePortalStore((s) => s.setOpenIssue);
  const bumpProjectData = usePortalStore((s) => s.bumpProjectData);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);

  const [projectId, setProjectId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priorityId, setPriorityId] = useState("none");
  const [assigneeId, setAssigneeId] = useState("none");
  const [storyPoints, setStoryPoints] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueOpen, setDueOpen] = useState(false);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const fixedProjectId = ctx?.kind === "project" ? ctx.projectId : null;
  const projects = workspace?.projects ?? [];
  const types = workspace?.issueTypes ?? [];
  const priorities = workspace?.priorities ?? [];
  const labels = workspace?.labels ?? [];
  const members = useMemo(() => workspace?.members ?? [], [workspace]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const archivedProject = selectedProject?.archived ?? false;

  useEffect(() => {
    if (!ctx) return;
    const firstProject = fixedProjectId ?? workspace?.projects.find((p) => !p.archived)?.id ?? "";
    setProjectId(firstProject);
    const defaultType = types.find((t) => t.name === "Task") ?? types[0];
    setTypeId(defaultType?.id ?? "");
    setSummary("");
    setDescription("");
    setPriorityId("none");
    setAssigneeId(me ? me.id : "none");
    setStoryPoints("");
    setDueDate(undefined);
    setLabelIds([]);
  }, [ctx]);

  const dueShort = dueDate ? format(dueDate, "MMM d, yyyy") : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !typeId || !summary.trim()) {
      toast.error("Project, type and summary are required");
      return;
    }
    setBusy(true);
    try {
      const created: IssueDTO = await api.createIssue({
        projectId,
        typeId,
        summary: summary.trim(),
        description: description.trim() || undefined,
        priorityId: priorityId === "none" ? undefined : priorityId,
        assigneeId: assigneeId === "none" ? undefined : assigneeId,
        storyPoints: storyPoints === "" ? undefined : Math.max(0, Number(storyPoints)),
        dueDate: dueDate ? dueDate.toISOString() : undefined,
        labelIds: labelIds.length ? labelIds : undefined,
      });
      toast.success(`${created.key} created`);
      closeCreateIssue();
      void refreshWorkspace();
      bumpProjectData();
      openIssue(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={ctx !== null} onOpenChange={(o) => !o && closeCreateIssue()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4 text-amber-600" aria-hidden /> New issue
          </DialogTitle>
          <DialogDescription>
            {fixedProjectId ? "The issue will be added to this project's backlog." : "Pick a project and describe the work."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={fixedProjectId !== null}>
                <SelectTrigger aria-label="Project">
                  {selectedProject ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="flex size-4 items-center justify-center rounded text-white text-[8px]"
                        style={{ backgroundColor: selectedProject.color }}
                        aria-hidden
                      >
                        {selectedProject.key[0]}
                      </span>
                      <span className="truncate">
                        {selectedProject.key} · {selectedProject.name}
                      </span>
                    </span>
                  ) : (
                    <SelectValue placeholder="Select project" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.archived}>
                      {p.key} · {p.name}{p.archived ? " (archived)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger aria-label="Issue type">
                  {types.find((t) => t.id === typeId) ? (
                    <span className="flex items-center gap-1.5">
                      <IssueTypeIcon type={types.find((t) => t.id === typeId)!} size={13} />
                      {types.find((t) => t.id === typeId)!.name}
                    </span>
                  ) : (
                    <SelectValue placeholder="Type" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <IssueTypeIcon type={t} size={13} /> {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-summary">Summary</Label>
            <Input
              id="issue-summary"
              required
              placeholder="Short, action-oriented summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-desc">Description</Label>
            <Textarea
              id="issue-desc"
              rows={3}
              placeholder="Context, acceptance criteria… (markdown supported)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priorityId} onValueChange={setPriorityId}>
                <SelectTrigger aria-label="Priority">
                  {priorityId !== "none" && priorities.find((p) => p.id === priorityId) ? (
                    <span className="flex items-center gap-1.5">
                      <PriorityIcon priority={priorities.find((p) => p.id === priorityId)!} size={12} />
                      {priorities.find((p) => p.id === priorityId)!.name}
                    </span>
                  ) : (
                    "None"
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {priorities.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <PriorityIcon priority={p} size={12} /> {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger aria-label="Assignee">
                  {assigneeId !== "none" && members.find((m) => m.id === assigneeId) ? (
                    <span className="flex items-center gap-1.5">
                      <Avatar name={members.find((m) => m.id === assigneeId)!.name} color={members.find((m) => m.id === assigneeId)!.avatarColor} size="xs" />
                      {members.find((m) => m.id === assigneeId)!.name}
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <Avatar name={m.name} color={m.avatarColor} size="xs" />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-pts">Story points</Label>
              <Input
                id="issue-pts"
                type="number"
                min={0}
                placeholder="—"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <div className="flex gap-1">
                <Popover open={dueOpen} onOpenChange={setDueOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("h-9 flex-1 justify-start font-normal", !dueShort && "text-stone-400")}
                      aria-label="Due date"
                    >
                      <CalendarClock className="size-3.5 text-stone-400" aria-hidden />
                      {dueShort || "Set date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(d) => {
                        setDueDate(d);
                        setDueOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {dueDate && (
                  <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Clear due date" onClick={() => setDueDate(undefined)}>
                    <span aria-hidden>×</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => {
                const active = labelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLabelIds((ids) => (active ? ids.filter((i) => i !== l.id) : [...ids, l.id]))}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                      active ? "border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-300"
                    )}
                    style={active ? { backgroundColor: `${l.color}22`, color: l.color } : undefined}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>

          {archivedProject && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              This project is archived — pick another project.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCreateIssue}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || archivedProject} className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
