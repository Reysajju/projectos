"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Inbox } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { CustomFieldDTO, IssueDTO, StatusDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { PriorityIcon } from "./PriorityIcon";
import { formatDateShort, formatDate } from "./RelativeTime";
import { FilterBar, matchesFilters, useIssueFilters } from "./issue-filters";
import { useProjectData } from "./project-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type SortKey = "key" | "updated" | "due";

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function formatCustom(value: string | undefined, type: string): string {
  if (value == null || value === "") return "";
  if (type === "DATE") return formatDateShort(value);
  if (type === "CHECKBOX") return value === "true" ? "Yes" : "No";
  return value;
}

export function IssuesTableView() {
  const { data, applyIssue, refetch } = useProjectData();
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const role = usePortalStore((s) => s.role);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const { filters, patch } = useIssueFilters();
  const [sortKey, setSortKey] = useState<SortKey>("key");
  const [sortAsc, setSortAsc] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Inline editing is available to every role except VIEWER (API enforces too).
  const editable = role !== "VIEWER";

  const statuses = useMemo(
    () => [...(workspace?.statuses ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );
  const customFields = useMemo(() => workspace?.customFields ?? [], [workspace]);

  const sprints = data?.sprints ?? [];
  const sprintName = (id: string | null) => (id ? sprints.find((s) => s.id === id)?.name ?? "—" : "—");

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.issues.filter((i) => matchesFilters(i, filters, me?.id ?? null));
    const dir = sortAsc ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortKey === "key") return a.key.localeCompare(b.key, undefined, { numeric: true }) * dir;
      if (sortKey === "updated") return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return (ad - bd) * dir;
    });
  }, [data, filters, me, sortKey, sortAsc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }

  async function changeStatus(issue: IssueDTO, statusId: string) {
    if (issue.statusId === statusId) return;
    const status = statuses.find((s) => s.id === statusId);
    if (!status) return;
    setRowBusy(issue.id);
    // Optimistic
    applyIssue({ ...issue, statusId, status });
    try {
      const updated = await api.patchIssue(issue.id, { statusId });
      applyIssue(updated);
      toast.success(`${issue.key} moved to ${status.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change status");
      void refetch();
    } finally {
      setRowBusy(null);
    }
  }

  function exportCsv() {
    if (!data) return;
    const header = [
      "Key",
      "Summary",
      "Type",
      "Status",
      "Priority",
      "Assignee",
      "Sprint",
      "Story points",
      "Due",
      "Updated",
      ...customFields.map((f) => f.name),
    ];
    const lines = [header.join(",")];
    for (const i of rows) {
      lines.push(
        [
          i.key,
          i.summary,
          i.type.name,
          i.status.name,
          i.priority?.name ?? "",
          i.assignee?.name ?? "",
          sprintName(i.sprintId),
          i.storyPoints?.toString() ?? "",
          i.dueDate ? formatDate(i.dueDate) : "",
          formatDate(i.updatedAt),
          ...customFields.map((f) => formatCustom(i.customFields?.[f.id], f.type)),
        ]
          .map((c) => csvEscape(c))
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.project.key}-issues-${formatDateShort(new Date().toISOString()).replace(/\s/g, "")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} issues to CSV`);
  }

  if (!data) return null;

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortKey === k &&
        (sortAsc ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
    </button>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar filters={filters} patch={patch} />
        <div className="flex items-center gap-3">
          {editable && (
            <span className="hidden text-[11px] text-muted-foreground/70 lg:inline">
              Tip: click <span className="font-medium text-muted-foreground">estimate</span>,{" "}
              <span className="font-medium text-muted-foreground">sprint</span> or custom cells to edit inline
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-3.5" aria-hidden /> Export CSV
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No issues match"
          hint={data.issues.length === 0 ? "Create the first issue with the button above." : "Try clearing filters."}
        />
      ) : (
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/50/95 backdrop-blur">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24"><SortHeader k="key" label="Key" /></TableHead>
                <TableHead className="min-w-64">Summary</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-36">Assignee</TableHead>
                <TableHead className="w-32">Sprint</TableHead>
                <TableHead className="w-14 text-right">Pts</TableHead>
                <TableHead className="w-24"><SortHeader k="due" label="Due" /></TableHead>
                {customFields.map((f) => (
                  <TableHead key={f.id} className="w-28 whitespace-nowrap" title={f.name}>
                    {f.name}
                  </TableHead>
                ))}
                <TableHead className="w-28"><SortHeader k="updated" label="Updated" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((issue) => (
                <TableRow
                  key={issue.id}
                  className={cn("cursor-pointer", rowBusy === issue.id && "opacity-60")}
                  onClick={() => setOpenIssue(issue.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setOpenIssue(issue.id);
                  }}
                  tabIndex={0}
                  aria-label={`Open issue ${issue.key}`}
                >
                  <TableCell>
                    <KeyBadge>{issue.key}</KeyBadge>
                  </TableCell>
                  <TableCell>
                    <span className="line-clamp-1 text-sm font-medium text-foreground">{issue.summary}</span>
                  </TableCell>
                  <TableCell>
                    <IssueTypeIcon type={issue.type} />
                    <span className="sr-only">{issue.type.name}</span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={issue.statusId} onValueChange={(v) => void changeStatus(issue, v)}>
                      <SelectTrigger
                        size="sm"
                        className="h-7 w-[132px] border-dashed bg-card text-xs"
                        aria-label={`Status of ${issue.key}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: issue.status.color }} aria-hidden />
                          <span className="truncate">{issue.status.name}</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s: StatusDTO) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <PriorityIcon priority={issue.priority} />
                    <span className="sr-only">{issue.priority?.name ?? "none"}</span>
                  </TableCell>
                  <TableCell>
                    {issue.assignee ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Avatar name={issue.assignee.name} color={issue.assignee.avatarColor} size="sm" />
                        <span className="max-w-20 truncate">{issue.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/80">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <SprintCell issue={issue} sprints={sprints} editable={editable} onSaved={applyIssue} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <PointsCell issue={issue} editable={editable} onSaved={applyIssue} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateShort(issue.dueDate)}</TableCell>
                  {customFields.map((f) => (
                    <TableCell key={f.id} className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      <CustomCell issue={issue} field={f} editable={editable} onSaved={applyIssue} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <span className="text-xs text-muted-foreground/80">{formatDateShort(issue.updatedAt)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Inline-editable cells ──────────────────────────────────────

/** Compact inline text/number/date input used by editable cells. */
function CellInput({
  type = "text",
  initial,
  widthClass,
  ariaLabel,
  onCommit,
  onClose,
}: {
  type?: "text" | "number" | "date";
  initial: string;
  widthClass?: string;
  ariaLabel: string;
  onCommit: (value: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (type !== "date") ref.current?.select();
  }, [type]);

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={initial}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== initial) onCommit(v === "" ? null : v);
        else onClose();
      }}
      className={cn(
        "h-7 rounded-md border border-amber-500/60 bg-background px-2 text-xs tabular-nums text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
        widthClass
      )}
    />
  );
}

function PointsCell({
  issue,
  editable,
  onSaved,
}: {
  issue: IssueDTO;
  editable: boolean;
  onSaved: (i: IssueDTO) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function commit(raw: string | null) {
    setEditing(false);
    const n = raw === null || raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 999)) {
      toast.error("Story points must be a number between 0 and 999");
      return;
    }
    try {
      const updated = await api.patchIssue(issue.id, { storyPoints: n });
      onSaved(updated);
      toast.success(n === null ? `${issue.key} estimate cleared` : `${issue.key} → ${n} pts`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update estimate");
    }
  }

  if (!editable) {
    return <span className="text-xs text-muted-foreground">{issue.storyPoints ?? "—"}</span>;
  }
  if (editing) {
    return (
      <CellInput
        type="number"
        initial={issue.storyPoints?.toString() ?? ""}
        widthClass="w-16 text-right"
        ariaLabel={`Story points of ${issue.key}`}
        onCommit={(v) => void commit(v)}
        onClose={() => setEditing(false)}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Edit story points"
      aria-label={`Edit story points of ${issue.key}`}
      className={cn(
        "min-w-8 rounded px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        issue.storyPoints != null && "font-medium text-foreground"
      )}
    >
      {issue.storyPoints ?? "—"}
    </button>
  );
}

function SprintCell({
  issue,
  sprints,
  editable,
  onSaved,
}: {
  issue: IssueDTO;
  sprints: { id: string; name: string; status: string }[];
  editable: boolean;
  onSaved: (i: IssueDTO) => void;
}) {
  if (!editable || sprints.length === 0) {
    const name = sprints.find((s) => s.id === issue.sprintId)?.name;
    return <span className="truncate text-xs text-muted-foreground">{name ?? "—"}</span>;
  }

  async function change(sprintId: string | null) {
    if ((issue.sprintId ?? null) === sprintId) return;
    try {
      const updated = await api.patchIssue(issue.id, { sprintId });
      onSaved(updated);
      toast.success(
        sprintId === null
          ? `${issue.key} moved to backlog`
          : `${issue.key} moved to ${sprints.find((s) => s.id === sprintId)?.name ?? "sprint"}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change sprint");
    }
  }

  return (
    <Select value={issue.sprintId ?? "__backlog"} onValueChange={(v) => void change(v === "__backlog" ? null : v)}>
      <SelectTrigger
        size="sm"
        className="h-7 w-[120px] border-dashed bg-card text-xs text-muted-foreground"
        aria-label={`Sprint of ${issue.key}`}
      >
        <span className="truncate">
          {issue.sprintId ? sprints.find((s) => s.id === issue.sprintId)?.name ?? "—" : "Backlog"}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__backlog">
          <span className="text-muted-foreground/80">Backlog</span>
        </SelectItem>
        {sprints.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomCell({
  issue,
  field,
  editable,
  onSaved,
}: {
  issue: IssueDTO;
  field: CustomFieldDTO;
  editable: boolean;
  onSaved: (i: IssueDTO) => void;
}) {
  const [editing, setEditing] = useState(false);
  const raw = issue.customFields?.[field.id] ?? null;

  async function save(value: string | null) {
    setEditing(false);
    try {
      // The API replaces the whole values map — merge client-side.
      const merged = { ...(issue.customFields ?? {}), [field.id]: value } as Record<string, string>;
      const updated = await api.patchIssue(issue.id, { customFields: merged });
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update field");
    }
  }

  const staticView = formatCustom(raw, field.type) || <span className="text-muted-foreground/60">—</span>;

  if (!editable) return <span className="text-xs text-muted-foreground">{staticView}</span>;

  switch (field.type) {
    case "CHECKBOX":
      return (
        <button
          type="button"
          onClick={() => void save(raw === "true" ? "false" : "true")}
          aria-label={`Toggle ${field.name} of ${issue.key}`}
          aria-pressed={raw === "true"}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            raw === "true"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {raw === "true" ? "Yes" : "No"}
        </button>
      );
    case "SELECT":
      return (
        <Select value={raw ?? "__none"} onValueChange={(v) => void save(v === "__none" ? null : v)}>
          <SelectTrigger
            size="sm"
            className="h-7 w-[104px] border-dashed bg-card text-xs"
            aria-label={`${field.name} of ${issue.key}`}
          >
            <span className={cn("truncate", !raw && "text-muted-foreground/60")}>{raw ?? "—"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">
              <span className="text-muted-foreground/80">None</span>
            </SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "NUMBER":
    case "DATE":
    case "TEXT":
    default: {
      if (editing) {
        const initial =
          field.type === "DATE" && raw ? raw.slice(0, 10) : raw ?? "";
        return (
          <CellInput
            type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
            initial={initial}
            widthClass={field.type === "DATE" ? "w-32" : "w-24"}
            ariaLabel={`${field.name} of ${issue.key}`}
            onCommit={(v) => {
              if (field.type === "NUMBER" && v !== null && v !== "") {
                if (!Number.isFinite(Number(v))) {
                  toast.error(`${field.name} expects a number`);
                  return;
                }
                void save(String(Number(v)));
              } else if (field.type === "DATE" && v) {
                const d = new Date(`${v}T12:00:00`);
                if (Number.isNaN(d.getTime())) {
                  toast.error(`${field.name} expects a date`);
                  return;
                }
                void save(d.toISOString());
              } else {
                void save(v);
              }
            }}
            onClose={() => setEditing(false)}
          />
        );
      }
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={`Edit ${field.name}`}
          aria-label={`Edit ${field.name} of ${issue.key}`}
          className="max-w-28 truncate rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          {staticView}
        </button>
      );
    }
  }
}
