"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";

import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO } from "@/lib/portal-types";
import { Avatar } from "./Avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface IssueFilters {
  assignee: string; // "all" | "none" | userId
  typeId: string; // "all" | typeId
  priorityId: string; // "all" | priorityId
  q: string;
  onlyMine: boolean;
}

export const EMPTY_FILTERS: IssueFilters = {
  assignee: "all",
  typeId: "all",
  priorityId: "all",
  q: "",
  onlyMine: false,
};

export function matchesFilters(issue: IssueDTO, f: IssueFilters, meId: string | null): boolean {
  if (f.assignee !== "all") {
    if (f.assignee === "none" && issue.assigneeId) return false;
    if (f.assignee !== "none" && issue.assigneeId !== f.assignee) return false;
  }
  if (f.typeId !== "all" && issue.typeId !== f.typeId) return false;
  if (f.priorityId !== "all" && issue.priorityId !== f.priorityId) return false;
  if (f.onlyMine && (!meId || issue.assigneeId !== meId)) return false;
  if (f.q.trim()) {
    const needle = f.q.trim().toLowerCase();
    const hay = `${issue.key} ${issue.summary} ${issue.description ?? ""}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function useIssueFilters() {
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const patch = (p: Partial<IssueFilters>) => setFilters((f) => ({ ...f, ...p }));
  return { filters, patch, reset: () => setFilters(EMPTY_FILTERS) };
}

export function FilterBar({
  filters,
  patch,
  actions,
}: {
  filters: IssueFilters;
  patch: (p: Partial<IssueFilters>) => void;
  actions?: React.ReactNode;
}) {
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);

  const members = useMemo(() => workspace?.members ?? [], [workspace]);
  const types = useMemo(() => workspace?.issueTypes ?? [], [workspace]);
  const priorities = useMemo(() => workspace?.priorities ?? [], [workspace]);

  const hasFilters =
    filters.assignee !== "all" ||
    filters.typeId !== "all" ||
    filters.priorityId !== "all" ||
    filters.onlyMine ||
    filters.q.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Filter issues by text"
        placeholder="Filter by text…"
        className="h-8 w-full sm:w-44"
        value={filters.q}
        onChange={(e) => patch({ q: e.target.value })}
      />
      <Select value={filters.assignee} onValueChange={(v) => patch({ assignee: v })}>
        <SelectTrigger size="sm" className="h-8 w-full sm:w-40" aria-label="Filter by assignee">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          <SelectItem value="none">Unassigned</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.typeId} onValueChange={(v) => patch({ typeId: v })}>
        <SelectTrigger size="sm" className="h-8 w-full sm:w-36" aria-label="Filter by type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.priorityId} onValueChange={(v) => patch({ priorityId: v })}>
        <SelectTrigger size="sm" className="h-8 w-full sm:w-36" aria-label="Filter by priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs font-normal text-muted-foreground">
        <Switch
          checked={filters.onlyMine}
          onCheckedChange={(v) => patch({ onlyMine: v })}
          aria-label="Only my issues"
        />
        <span className="flex items-center gap-1">
          {me && <Avatar name={me.name} color={me.avatarColor} size="xs" />}
          Only mine
        </span>
      </Label>
      {hasFilters && (
        <button
          type="button"
          onClick={() => patch(EMPTY_FILTERS)}
          className="h-8 rounded-md px-2 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          <Filter className="mr-1 inline size-3" aria-hidden /> Clear
        </button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
