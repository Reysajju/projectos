"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  CircleAlert,
  Command,
  Play,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { api, api2 } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { SavedFilterDTO } from "@/lib/portal-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Avatar } from "./Avatar";
import { KeyBadge } from "./KeyBadge";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";
import type { IssueDTO } from "@/lib/portal-types";

const EXAMPLES = [
  'status = "In Progress"',
  "assignee = me AND status != Done",
  'project = WEB AND priority = "Highest"',
  "due = overdue",
  "points > 0 AND sprint = active", // shows parser error styling too
  "label = security",
  "link = blocks AND status != Done",
];

const FIELD_HINTS: [string, string][] = [
  ["status", '= "In Progress" · != Done · ~ Progress'],
  ["assignee", "= me · = none · = aisha"],
  ["type", "= Bug · = Story"],
  ["priority", "= Highest · != Low"],
  ["sprint", "= active · = backlog · = none"],
  ["project", "= WEB · = APP"],
  ["label", "= security"],
  ["points", "= 5 · != 3"],
  ["due", "= overdue · = none"],
  ["created / updated", "= 7d · = today"],
  ["link", "= blocks · = none · != relates"],
  ["linked", "= WEB-9 · != WEB-9"],
];

export function AdvancedSearchView() {
  const workspace = usePortalStore((s) => s.workspace);
  const me = usePortalStore((s) => s.me);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const searchSeedQuery = usePortalStore((s) => s.searchSeedQuery);
  const clearSearchSeed = usePortalStore((s) => s.clearSearchSeed);

  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<IssueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SavedFilterDTO[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api2.advancedSearch(trimmed);
      setIssues(res.issues);
      setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      const res = await api2.filters();
      setFilters(res.filters);
    } catch {
      setFilters([]);
    }
  }, []);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  // Seed query coming from the ⌘K palette
  useEffect(() => {
    if (searchSeedQuery) {
      setQuery(searchSeedQuery);
      void run(searchSeedQuery);
      clearSearchSeed();
      inputRef.current?.focus();
    }
     
  }, [searchSeedQuery]);

  async function saveFilter() {
    if (!saveName.trim() || !query.trim()) return;
    try {
      await api2.createFilter({ name: saveName.trim(), query: query.trim() });
      toast.success("Filter saved", { description: query.trim() });
      setSaveOpen(false);
      setSaveName("");
      void loadFilters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save filter");
    }
  }

  async function deleteFilter(f: SavedFilterDTO) {
    try {
      await api2.deleteFilter(f.id);
      setFilters((prev) => prev?.filter((x) => x.id !== f.id) ?? null);
      toast.success(`Removed "${f.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete filter");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700">
          <Search className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Advanced search</h1>
          <p className="text-xs text-muted-foreground">
            JQL-lite — e.g.{" "}
            <code className="rounded bg-muted px-1 py-px font-mono text-[11px]">
              status = &quot;In Progress&quot; AND assignee = me
            </code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          <Command className="size-3.5" aria-hidden /> Syntax
        </Button>
      </div>

      {/* Query bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(query);
            }}
            placeholder='Try: assignee = me AND status != Done'
            className={cn(
              "h-10 pl-9 font-mono text-[13px]",
              error && "border-rose-400 focus-visible:ring-rose-300"
            )}
            aria-label="JQL query"
          />
        </div>
        <Button
          className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
          onClick={() => void run(query)}
          disabled={loading || !query.trim()}
        >
          <Play className="size-3.5" aria-hidden /> {loading ? "Searching…" : "Run"}
        </Button>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => setSaveOpen(true)}
          disabled={!query.trim() || !!error}
          title="Save this query as a filter"
        >
          <BookmarkPlus className="size-4" aria-hidden /> Save
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden /> {error}
        </div>
      )}

      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              void run(ex);
            }}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-600"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Saved filters */}
      {filters && filters.length > 0 && (
        <section aria-label="Saved filters" className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saved filters · {filters.length}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filters.map((f) => (
              <div
                key={f.id}
                className="group flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors hover:border-amber-500/40"
              >
                <button
                  type="button"
                  onClick={() => {
                    setQuery(f.query);
                    void run(f.query);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-foreground">{f.name}</div>
                  <code className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                    {f.query}
                  </code>
                </button>
                <Avatar name={f.owner.name} color={f.owner.avatarColor} size="xs" />
                <button
                  type="button"
                  aria-label={`Delete filter ${f.name}`}
                  onClick={() => void deleteFilter(f)}
                  className="rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      <section aria-label="Search results" className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Results{issues ? ` · ${issues.length}` : ""}
        </h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : issues === null ? (
          <EmptyState
            icon={Search}
            title="Run a query to see matching issues"
            hint="Results span every project in the workspace."
          />
        ) : issues.length === 0 && !error ? (
          <EmptyState icon={Search} title="No issues match" hint="Loosen a condition or clear a filter." />
        ) : (
          <div className="max-h-[calc(100vh-24rem)] overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar]:w-1.5">
            {issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => setOpenIssue(issue.id)}
                className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/40"
              >
                <IssueTypeIcon type={issue.type} size={15} />
                <KeyBadge>{issue.key}</KeyBadge>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{issue.summary}</span>
                <StatusBadge status={issue.status} />
                {issue.priority && <PriorityIcon priority={issue.priority} size={13} />}
                {issue.storyPoints != null && (
                  <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                    {issue.storyPoints}
                  </span>
                )}
                {issue.assignee ? (
                  <Avatar name={issue.assignee.name} color={issue.assignee.avatarColor} size="xs" />
                ) : (
                  <span className="size-6" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save filter</DialogTitle>
            <DialogDescription className="font-mono text-[11px]">{query}</DialogDescription>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Filter name — e.g. My current sprint"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveFilter();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => void saveFilter()}
              disabled={!saveName.trim()}
            >
              Save filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Syntax help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>JQL-lite syntax</DialogTitle>
            <DialogDescription>
              Combine clauses with <code className="font-mono">AND</code> /{" "}
              <code className="font-mono">OR</code> and parentheses. Operators:{" "}
              <code className="font-mono">=</code>, <code className="font-mono">!=</code>,{" "}
              <code className="font-mono">~</code> (contains). <code className="font-mono">me</code> means you.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {FIELD_HINTS.map(([f, hint]) => (
              <div key={f} className="flex items-baseline justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5">
                <code className="font-mono text-xs font-semibold text-foreground">{f}</code>
                <span className="font-mono text-[11px] text-muted-foreground">{hint}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
