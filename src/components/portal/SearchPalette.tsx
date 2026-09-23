"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, FolderKanban, Loader2, Search, Square } from "lucide-react";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, ProjectDTO, SearchPayload } from "@/lib/portal-types";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { StatusDot } from "./StatusBadge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]{1,9}-\d{1,6}$/;

export function SearchPalette() {
  const open = usePortalStore((s) => s.searchOpen);
  const setOpen = usePortalStore((s) => s.setSearchOpen);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const openProject = usePortalStore((s) => s.openProject);
  const me = usePortalStore((s) => s.me);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!usePortalStore.getState().searchOpen);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmed || trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const payload = await api.search(trimmed);
        setResults(payload);
      } catch {
        setResults({ issues: [], projects: [] });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Minimal "JQL-lite" parsing
  const parsed = useMemo(() => {
    const trimmed = query.trim();
    const tokens = trimmed.split(/\s+/);
    const assigneeMe = tokens.includes("assignee:me");
    const q = tokens.filter((t) => t !== "assignee:me").join(" ");
    const directKey = KEY_RE.test(trimmed) ? trimmed.toUpperCase() : null;
    return { assigneeMe, q, directKey };
  }, [query]);

  function filterIssues(issues: IssueDTO[]): IssueDTO[] {
    let list = issues;
    if (parsed.assigneeMe && me) list = list.filter((i) => i.assigneeId === me.id);
    return list;
  }

  function openIssue(issue: IssueDTO) {
    setOpen(false);
    setOpenIssue(issue.id);
  }

  function openProjectBoard(project: ProjectDTO) {
    setOpen(false);
    openProject(project.id);
  }

  // Direct key jump: when a single exact key match exists, highlight action
  const issues = results ? filterIssues(results.issues) : [];
  const projects = results?.projects ?? [];
  const exactIssue = parsed.directKey ? issues.find((i) => i.key.toUpperCase() === parsed.directKey) : null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search issues and projects"
      className="sm:max-w-xl"
    >
      <CommandInput
        placeholder="Search issues and projects… try WEB-12, assignee:me, or plain text"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[360px]">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-400">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
          </div>
        )}
        {!loading && query.trim().length >= 2 && issues.length === 0 && projects.length === 0 && (
          <CommandEmpty>No results for “{query}”.</CommandEmpty>
        )}
        {!loading && query.trim().length < 2 && (
          <div className="px-4 py-6 text-center text-xs text-stone-400">
            <Search className="mx-auto mb-2 size-5 text-stone-300" aria-hidden />
            Type at least 2 characters. Jump straight to an issue with its key (e.g. <span className="font-mono text-stone-500">WEB-12</span>) or filter with{" "}
            <span className="font-mono text-stone-500">assignee:me</span>.
          </div>
        )}

        {exactIssue && (
          <>
            <CommandGroup heading="Jump to">
              <CommandItem
                value={`jump-${exactIssue.key}`}
                onSelect={() => openIssue(exactIssue)}
                className="gap-2"
              >
                <IssueTypeIcon type={exactIssue.type} size={13} />
                <KeyBadge>{exactIssue.key}</KeyBadge>
                <span className="min-w-0 flex-1 truncate">{exactIssue.summary}</span>
                <CornerDownLeft className="size-3.5 text-stone-400" aria-hidden />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {issues.length > 0 && (
          <CommandGroup heading="Issues">
            {issues.slice(0, 10).map((issue) => (
              <CommandItem
                key={issue.id}
                value={`${issue.key} ${issue.summary}`}
                onSelect={() => openIssue(issue)}
                className="gap-2"
              >
                <IssueTypeIcon type={issue.type} size={13} />
                <KeyBadge>{issue.key}</KeyBadge>
                <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
                <StatusDot status={issue.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {projects.length > 0 && (
          <>
            {issues.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.key} ${project.name}`}
                  onSelect={() => openProjectBoard(project)}
                  className="gap-2"
                >
                  {project.archived ? (
                    <Square className="size-3.5 text-stone-400" aria-hidden />
                  ) : (
                    <FolderKanban className="size-3.5 text-stone-400" aria-hidden />
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-stone-500">{project.key}</span>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-[10px] text-stone-400">{project.issueCount} issues</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
