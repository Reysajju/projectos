"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeftRight,
  AtSign,
  CalendarClock,
  CalendarRange,
  CheckCheck,
  Copy,
  GitBranch,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type {
  ActivityDTO,
  CommentDTO,
  IssueDTO,
  IssueDetailPayload,
  SprintDTO,
  StatusDTO,
} from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { PriorityIcon } from "./PriorityIcon";
import { RelativeTime, formatDate } from "./RelativeTime";
import { CustomFieldValue } from "./CustomFieldValue";
import { AttachmentsSection } from "./AttachmentsSection";
import { useWorkflowData } from "./use-workflow";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  "issue.created": Plus,
  "issue.updated": Pencil,
  "issue.status_changed": ArrowLeftRight,
  "issue.assigned": AtSign,
  "comment.created": MessageSquare,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

export function IssuePanel() {
  const openIssueId = usePortalStore((s) => s.openIssueId);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const role = usePortalStore((s) => s.role);
  const bumpProjectData = usePortalStore((s) => s.bumpProjectData);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);

  const [detail, setDetail] = useState<IssueDetailPayload | null>(null);
  const [sprints, setSprints] = useState<SprintDTO[]>([]);
  const [loading, setLoading] = useState(false);

  // editing state
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  const issue = detail?.issue ?? null;
  const members = useMemo(() => workspace?.members ?? [], [workspace]);
  const types = useMemo(() => workspace?.issueTypes ?? [], [workspace]);
  const statuses = useMemo(
    () => [...(workspace?.statuses ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );
  const priorities = useMemo(
    () => [...(workspace?.priorities ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );
  const labels = useMemo(() => workspace?.labels ?? [], [workspace]);
  const customFieldDefs = useMemo(() => workspace?.customFields ?? [], [workspace]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const d = await api.getIssue(id);
      setDetail(d);
      // Sprint list comes from the project detail (best-effort, non-fatal).
      try {
        const p = await api.getProject(d.issue.projectId);
        setSprints(p.sprints);
      } catch {
        setSprints([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load issue");
      setOpenIssue(null);
    } finally {
      setLoading(false);
    }
  }, [setOpenIssue]);

  useEffect(() => {
    if (!openIssueId) {
      setDetail(null);
      return;
    }
    setEditingSummary(false);
    setEditingDesc(false);
    setCommentDraft("");
    setSubtaskDraft("");
    void load(openIssueId);
  }, [openIssueId, load]);

  async function patch(body: Record<string, unknown>, opts?: { silent?: boolean }) {
    if (!issue) return;
    try {
      const updated = await api.patchIssue(issue.id, body);
      setDetail((d) => (d ? { ...d, issue: updated } : d));
      bumpProjectData();
      if (!opts?.silent) toast.success(`${issue.key} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update issue");
      if (openIssueId) void load(openIssueId);
    }
  }

  async function saveSummary() {
    if (!issue) return;
    const next = summaryDraft.trim();
    setEditingSummary(false);
    if (!next || next === issue.summary) return;
    await patch({ summary: next });
  }

  async function saveDescription() {
    if (!issue) return;
    setEditingDesc(false);
    const next = descDraft.trim();
    if (next === (issue.description ?? "")) return;
    await patch({ description: next || null });
  }

  async function postComment() {
    if (!issue || !commentDraft.trim()) return;
    setPostingComment(true);
    try {
      const comment = await api.addComment(issue.id, { body: commentDraft.trim() });
      setDetail((d) => (d ? { ...d, comments: [...d.comments, comment] } : d));
      setCommentDraft("");
      bumpProjectData();
      toast.success("Comment added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteComment(id: string) {
    try {
      await api.deleteComment(id);
      setDetail((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d));
      bumpProjectData();
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete comment");
    }
  }

  async function toggleLabel(labelId: string) {
    if (!issue) return;
    const has = issue.labels.some((l) => l.id === labelId);
    const next = has ? issue.labels.filter((l) => l.id !== labelId).map((l) => l.id) : [...issue.labels.map((l) => l.id), labelId];
    await patch({ labelIds: next }, { silent: true });
  }

  async function addSubtask() {
    if (!issue || !subtaskDraft.trim()) return;
    const subType = types.find((t) => t.name.toLowerCase().includes("sub")) ?? types[types.length - 1];
    try {
      const created = await api.createIssue({
        projectId: issue.projectId,
        typeId: subType.id,
        summary: subtaskDraft.trim(),
        parentId: issue.id,
      });
      setDetail((d) =>
        d ? { ...d, subtasks: [...d.subtasks, created], issue: { ...d.issue, subtaskCount: d.issue.subtaskCount + 1 } } : d
      );
      setSubtaskDraft("");
      bumpProjectData();
      toast.success(`Subtask ${created.key} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create subtask");
    }
  }

  async function deleteIssue() {
    if (!issue) return;
    try {
      await api.deleteIssue(issue.id);
      toast.success(`${issue.key} deleted`);
      setConfirmDelete(false);
      setOpenIssue(null);
      bumpProjectData();
      void refreshWorkspace();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete issue");
    }
  }

  function copyIssueLink() {
    if (!issue) return;
    const url = `${window.location.origin}/?issue=${issue.key}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Issue link copied"))
      .catch(() => toast.error("Couldn't copy link"));
  }

  const canDelete = role === "ADMIN" || role === "MANAGER";
  const canEditFiles = role !== "VIEWER";
  const subtaskType = types.find((t) => t.name.toLowerCase().includes("sub")) ?? types[types.length - 1];

  return (
    <Sheet open={openIssueId !== null} onOpenChange={(o) => !o && setOpenIssue(null)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5"
      >
        {loading && !issue ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : issue ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-3 pr-14">
              <div className="flex items-center gap-2">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <KeyBadge>{issue.key}</KeyBadge>
                  <span className="text-xs font-normal text-muted-foreground/80">{issue.projectName}</span>
                </SheetTitle>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Copy issue link"
                    onClick={copyIssueLink}
                  >
                    <Copy className="size-3.5" aria-hidden />
                  </Button>
                  <Select
                    value={issue.typeId}
                    onValueChange={(v) => {
                      void patch({ typeId: v }, { silent: true });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 w-[120px] border-none bg-muted shadow-none"
                      aria-label="Issue type"
                    >
                      <span className="flex items-center gap-1.5 text-xs">
                        <IssueTypeIcon type={issue.type} size={12} />
                        {issue.type.name}
                      </span>
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
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Summary */}
              {editingSummary ? (
                <Input
                  autoFocus
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  onBlur={() => void saveSummary()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveSummary();
                    if (e.key === "Escape") setEditingSummary(false);
                  }}
                  aria-label="Issue summary"
                  className="text-base font-semibold"
                />
              ) : (
                <div
                  className="group flex cursor-text items-start gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  role="button"
                  tabIndex={0}
                  aria-label="Edit summary"
                  onClick={() => {
                    setSummaryDraft(issue.summary);
                    setEditingSummary(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSummaryDraft(issue.summary);
                      setEditingSummary(true);
                    }
                  }}
                >
                  <p className="flex-1 text-base font-semibold leading-snug text-foreground">{issue.summary}</p>
                  <Pencil className="mt-1 size-3.5 shrink-0 text-stone-300 transition-colors group-hover:text-muted-foreground" aria-hidden />
                </div>
              )}

              {/* Description */}
              <section className="mt-4" aria-label="Description">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Description</Label>
                  {!editingDesc && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground/80 underline-offset-2 hover:text-amber-700 hover:underline focus-visible:outline-none"
                      onClick={() => {
                        setDescDraft(issue.description ?? "");
                        setEditingDesc(true);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingDesc ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      autoFocus
                      rows={5}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      placeholder="Add a description… markdown supported (**bold**, lists, `code`)"
                      aria-label="Description editor"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 bg-amber-600 text-white hover:bg-amber-700" onClick={() => void saveDescription()}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingDesc(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : issue.description ? (
                  <div className="prose-sm mt-1.5 max-w-none rounded-md border border-border bg-muted/50/50 p-3 text-sm leading-relaxed text-foreground/90 [&_a]:text-amber-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-1">
                    <ReactMarkdown>{issue.description}</ReactMarkdown>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDescDraft("");
                      setEditingDesc(true);
                    }}
                    className="mt-1.5 w-full rounded-md border border-dashed border-border px-3 py-4 text-left text-xs text-muted-foreground/80 hover:border-stone-400 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    Add a description…
                  </button>
                )}
              </section>

              {/* Properties */}
              <section className="mt-5" aria-label="Properties">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Properties</Label>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border p-3">
                  <Field label="Status">
                    <WorkflowStatusSelect issue={issue} statuses={statuses} onStatusChange={(statusId) => void patch({ statusId }, { silent: true })} />
                  </Field>

                  <Field label="Assignee">
                    <Select
                      value={issue.assigneeId ?? "none"}
                      onValueChange={(v) => void patch({ assigneeId: v === "none" ? null : v }, { silent: true })}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label="Assignee">
                        {issue.assignee ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={issue.assignee.name} color={issue.assignee.avatarColor} size="xs" />
                            <span className="truncate">{issue.assignee.name}</span>
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
                  </Field>

                  <Field label="Priority">
                    <Select
                      value={issue.priorityId ?? "none"}
                      onValueChange={(v) => void patch({ priorityId: v === "none" ? null : v }, { silent: true })}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label="Priority">
                        {issue.priority ? (
                          <span className="flex items-center gap-1.5">
                            <PriorityIcon priority={issue.priority} size={12} />
                            {issue.priority.name}
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
                              <PriorityIcon priority={p} size={12} />
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Sprint">
                    <Select
                      value={issue.sprintId ?? "none"}
                      onValueChange={(v) => void patch({ sprintId: v === "none" ? null : v }, { silent: true })}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label="Sprint">
                        {issue.sprintId ? sprints.find((s) => s.id === issue.sprintId)?.name ?? "Sprint" : "Backlog"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Backlog (no sprint)</SelectItem>
                        {sprints.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Story points">
                    <Input
                      type="number"
                      min={0}
                      className="h-8"
                      aria-label="Story points"
                      defaultValue={issue.storyPoints ?? ""}
                      key={`pts-${issue.id}-${issue.storyPoints}`}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                        const next = Number.isFinite(v as number) ? v : null;
                        if (next !== issue.storyPoints) void patch({ storyPoints: next }, { silent: true });
                      }}
                    />
                  </Field>

                  <Field label="Start date">
                    <div className="flex items-center gap-1">
                      <Popover open={startOpen} onOpenChange={setStartOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn("h-8 flex-1 justify-start font-normal", !issue.startDate && "text-muted-foreground/80")}
                            aria-label="Start date"
                          >
                            <CalendarRange className="size-3.5 text-muted-foreground/80" aria-hidden />
                            {issue.startDate ? formatDate(issue.startDate) : "Set date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={issue.startDate ? new Date(issue.startDate) : undefined}
                            disabled={issue.dueDate ? { after: new Date(issue.dueDate) } : undefined}
                            onSelect={(d) => {
                              setStartOpen(false);
                              void patch({ startDate: d ? d.toISOString() : null }, { silent: true });
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      {issue.startDate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label="Clear start date"
                          onClick={() => void patch({ startDate: null }, { silent: true })}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </Field>

                  <Field label="Due date">
                    <div className="flex items-center gap-1">
                      <Popover open={dueOpen} onOpenChange={setDueOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn("h-8 flex-1 justify-start font-normal", !issue.dueDate && "text-muted-foreground/80")}
                            aria-label="Due date"
                          >
                            <CalendarClock className="size-3.5 text-muted-foreground/80" aria-hidden />
                            {issue.dueDate ? formatDate(issue.dueDate) : "Set date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={issue.dueDate ? new Date(issue.dueDate) : undefined}
                            onSelect={(d) => {
                              setDueOpen(false);
                              void patch({ dueDate: d ? d.toISOString() : null }, { silent: true });
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      {issue.dueDate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label="Clear due date"
                          onClick={() => void patch({ dueDate: null }, { silent: true })}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </Field>

                  <Field label="Estimate (h)">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      className="h-8"
                      aria-label="Estimate hours"
                      defaultValue={issue.estimateHours ?? ""}
                      key={`est-${issue.id}-${issue.estimateHours}`}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                        const next = Number.isFinite(v as number) ? v : null;
                        if (next !== issue.estimateHours) void patch({ estimateHours: next }, { silent: true });
                      }}
                    />
                  </Field>

                  <Field label="Remaining (h)">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      className="h-8"
                      aria-label="Remaining hours"
                      defaultValue={issue.remainingHours ?? ""}
                      key={`rem-${issue.id}-${issue.remainingHours}`}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                        const next = Number.isFinite(v as number) ? v : null;
                        if (next !== issue.remainingHours) void patch({ remainingHours: next }, { silent: true });
                      }}
                    />
                  </Field>

                  <div className="col-span-2">
                    <Field label="Labels">
                      <div className="flex flex-wrap gap-1.5">
                        {labels.map((l) => {
                          const active = issue.labels.some((il) => il.id === l.id);
                          return (
                            <button
                              key={l.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => void toggleLabel(l.id)}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                                active ? "border-transparent" : "border-border bg-card text-muted-foreground hover:border-border"
                              )}
                              style={active ? { backgroundColor: `${l.color}22`, color: l.color } : undefined}
                            >
                              {l.name}
                            </button>
                          );
                        })}
                        {labels.length === 0 && <span className="text-xs text-muted-foreground/80">No labels in workspace</span>}
                      </div>
                    </Field>
                  </div>

                  {customFieldDefs.length > 0 && (
                    <div className="col-span-2">
                      <Field label="Custom fields">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          {customFieldDefs.map((def) => (
                            <CustomFieldValue
                              key={def.id}
                              field={def}
                              value={issue.customFields?.[def.id] ?? null}
                              onChange={(value) => {
                                if (!issue) return;
                                const next = { ...(issue.customFields ?? {}) };
                                if (value == null || value === "") delete next[def.id];
                                else next[def.id] = value;
                                void patch({ customFields: next }, { silent: true });
                              }}
                            />
                          ))}
                        </div>
                      </Field>
                    </div>
                  )}

                  <div className="col-span-2 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground/80">
                    <span>Reporter: {issue.reporter?.name ?? "—"}</span>
                    <span>Created: {formatDate(issue.createdAt)}</span>
                  </div>
                </div>
              </section>

              {/* Subtasks */}
              <section className="mt-5" aria-label="Subtasks">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground/80" aria-hidden />
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    Subtasks {detail && detail.subtasks.length > 0 && `(${detail.subtasks.filter((s) => s.status.category === "DONE").length}/${detail.subtasks.length} done)`}
                  </Label>
                </div>
                {detail && detail.subtasks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {detail.subtasks.map((st) => (
                      <li key={st.id}>
                        <button
                          type="button"
                          onClick={() => setOpenIssue(st.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                        >
                          <IssueTypeIcon type={st.type} size={12} />
                          <KeyBadge>{st.key}</KeyBadge>
                          <span className={cn("min-w-0 flex-1 truncate", st.status.category === "DONE" && "text-muted-foreground/80 line-through")}>
                            {st.summary}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80">{st.status.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="mt-2 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addSubtask();
                  }}
                >
                  {subtaskType && <IssueTypeIcon type={subtaskType} size={12} />}
                  <Input
                    className="h-8"
                    placeholder="Add a subtask and press Enter…"
                    aria-label="New subtask summary"
                    value={subtaskDraft}
                    onChange={(e) => setSubtaskDraft(e.target.value)}
                  />
                  <Button type="submit" size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Add subtask" disabled={!subtaskDraft.trim()}>
                    <Plus className="size-4" aria-hidden />
                  </Button>
                </form>
              </section>

              <Separator className="my-5" />

              {/* Attachments */}
              {detail && (
                <AttachmentsSection
                  issueId={detail.issue.id}
                  issueKey={detail.issue.key}
                  attachments={detail.attachments}
                  canEdit={canEditFiles}
                  onChange={(next) => setDetail((d) => (d ? { ...d, attachments: next } : d))}
                />
              )}

              <Separator className="my-5" />

              {/* Comments */}
              <section aria-label="Comments">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  Comments {detail ? `(${detail.comments.length})` : ""}
                </Label>
                <ul className="mt-3 space-y-4">
                  {detail?.comments.map((c: CommentDTO) => (
                    <li key={c.id} className="flex gap-3">
                      <Avatar name={c.author.name} color={c.author.avatarColor} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{c.author.name}</span>
                          <RelativeTime date={c.createdAt} className="text-[11px] text-muted-foreground/80" />
                          {(me?.id === c.author.id || role === "ADMIN") && (
                            <button
                              type="button"
                              aria-label="Delete comment"
                              className="ml-auto rounded p-1 text-stone-300 hover:bg-rose-500/100/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                              onClick={() => void deleteComment(c.id)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{c.body}</p>
                      </div>
                    </li>
                  ))}
                  {detail && detail.comments.length === 0 && (
                    <li className="text-xs text-muted-foreground/80">No comments yet.</li>
                  )}
                </ul>

                <form
                  className="mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void postComment();
                  }}
                >
                  <div className="flex items-start gap-2">
                    {me && <Avatar name={me.name} color={me.avatarColor} size="md" />}
                    <div className="flex-1 space-y-2">
                      <Textarea
                        rows={2}
                        placeholder="Add a comment… use @Full Name to mention someone"
                        aria-label="New comment"
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700" disabled={!commentDraft.trim() || postingComment}>
                          {postingComment ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                          Comment
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </section>

              <Separator className="my-5" />

              {/* Activity */}
              <section aria-label="Activity">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Activity</Label>
                {detail && detail.activity.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground/80">No activity recorded yet.</p>
                ) : (
                  <ol className="mt-3 space-y-0">
                    {detail?.activity.map((a: ActivityDTO) => {
                      const Icon = ACTIVITY_ICONS[a.type] ?? CheckCheck;
                      return (
                        <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {detail && detail.activity.indexOf(a) < detail.activity.length - 1 && (
                            <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-muted" />
                          )}
                          <span className="z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-white">
                            <Icon className="size-3 text-muted-foreground" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1 text-sm">
                            <span className="font-medium text-foreground">{a.user.name}</span>{" "}
                            <span className="text-muted-foreground">
                              {a.field
                                ? `changed ${a.field}`
                                : a.type.replace("issue.", "").replace(/_/g, " ")}
                            </span>
                            {a.oldValue != null && a.newValue != null && (
                              <span className="text-muted-foreground">
                                : <span className="text-muted-foreground">{a.oldValue}</span> <span aria-hidden>→</span>{" "}
                                <span className="font-medium text-foreground/90">{a.newValue}</span>
                              </span>
                            )}
                            <div className="mt-0.5">
                              <RelativeTime date={a.createdAt} className="text-[11px] text-muted-foreground/80" />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t border-border bg-muted/50 px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-rose-600 hover:bg-rose-500/100/10 hover:text-rose-700"
                disabled={!canDelete}
                title={canDelete ? "Delete issue" : "Only ADMIN/MANAGER can delete issues"}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </Button>
              <span className="text-[11px] text-muted-foreground/80">
                Updated <RelativeTime date={issue.updatedAt} />
              </span>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {issue.key}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the issue{issue.subtaskCount > 0 ? ` and its ${issue.subtaskCount} subtask${issue.subtaskCount === 1 ? "" : "s"}` : ""}, comments and history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={(e) => { e.preventDefault(); void deleteIssue(); }}>
                    Delete issue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={GitBranch} title="No issue selected" hint="Pick an issue from a board, table or search." />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Workflow-aware status select ───────────────────────────────
// When the org runs a restricted workflow, statuses that are not
// reachable from the issue's current status are shown but disabled.

function WorkflowStatusSelect({
  issue,
  statuses,
  onStatusChange,
}: {
  issue: IssueDTO;
  statuses: StatusDTO[];
  onStatusChange: (statusId: string) => void;
}) {
  const { canMove } = useWorkflowData();
  return (
    <Select
      value={issue.statusId}
      onValueChange={onStatusChange}
    >
      <SelectTrigger size="sm" className="w-full" aria-label="Status">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: issue.status.color }} aria-hidden />
          {issue.status.name}
        </span>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => {
          const allowed = canMove(issue.statusId, s.id);
          return (
            <SelectItem key={s.id} value={s.id} disabled={!allowed}>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}
                {!allowed && (
                  <span className="text-[10px] text-muted-foreground/70">(workflow)</span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
