"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Inbox } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, StatusDTO } from "@/lib/portal-types";
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

export function IssuesTableView() {
  const { data, applyIssue, refetch } = useProjectData();
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const { filters, patch } = useIssueFilters();
  const [sortKey, setSortKey] = useState<SortKey>("key");
  const [sortAsc, setSortAsc] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const statuses = useMemo(
    () => [...(workspace?.statuses ?? [])].sort((a, b) => a.order - b.order),
    [workspace]
  );

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
    const header = ["Key", "Summary", "Type", "Status", "Priority", "Assignee", "Sprint", "Story points", "Due", "Updated"];
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
    <TableHead>
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
    </TableHead>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar filters={filters} patch={patch} />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-3.5" aria-hidden /> Export CSV
        </Button>
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
                  <TableCell>
                    <span className="truncate text-xs text-muted-foreground">{sprintName(issue.sprintId)}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {issue.storyPoints ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateShort(issue.dueDate)}</TableCell>
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
