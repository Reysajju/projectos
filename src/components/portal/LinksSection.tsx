"use client";

/**
 * Issue links section (blueprint §16) for the issue panel.
 * Directed links — blocks / duplicates / relates to / causes — with a
 * live-search issue picker, blocked-by warning banner, and one-click nav.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  GitFork,
  Link2,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { IssueDTO, IssueLinkType, LinkedIssueDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { usePortalStore } from "@/lib/portal-store";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";

interface Props {
  issueId: string;
  issueKey: string;
  links: LinkedIssueDTO[];
  canEdit: boolean;
  onChange: (next: LinkedIssueDTO[]) => void;
}

const LINK_TYPE_ORDER: IssueLinkType[] = ["BLOCKS", "CAUSES", "DUPLICATES", "RELATES"];

const TYPE_META: Record<
  IssueLinkType,
  { label: string; outward: string; inward: string; icon: typeof Link2; tint: string }
> = {
  BLOCKS: {
    label: "Blocks",
    outward: "blocks",
    inward: "is blocked by",
    icon: AlertTriangle,
    tint: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  CAUSES: {
    label: "Causes",
    outward: "causes",
    inward: "is caused by",
    icon: GitFork,
    tint: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  DUPLICATES: {
    label: "Duplicates",
    outward: "duplicates",
    inward: "is duplicated by",
    icon: Copy,
    tint: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  RELATES: {
    label: "Relates to",
    outward: "relates to",
    inward: "relates to",
    icon: Link2,
    tint: "bg-stone-100 text-stone-700 dark:bg-stone-800/80 dark:text-stone-300",
  },
};

function verbPhrase(link: LinkedIssueDTO): string {
  const meta = TYPE_META[link.type];
  return link.direction === "outward" ? meta.outward : meta.inward;
}

export function LinksSection({ issueId, issueKey, links, canEdit, onChange }: Props) {
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<IssueLinkType>("BLOCKS");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IssueDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false); // results dropdown
  const [submitting, setSubmitting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Live search for the issue picker (debounced, self excluded).
  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const payload = await api.search(q);
        setResults(payload.issues.filter((i) => i.id !== issueId).slice(0, 8));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, adding, issueId]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function createLink(target: IssueDTO) {
    setSubmitting(true);
    try {
      const created = await api.addIssueLink(issueId, { type, targetKey: target.key });
      onChange([...links, created]);
      setQuery("");
      setOpen(false);
      setResults([]);
      setAdding(false);
      toast.success(`${issueKey} ${verbPhrase(created)} ${target.key}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link issues");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeLink(link: LinkedIssueDTO) {
    try {
      await api.deleteIssueLink(link.linkId);
      onChange(links.filter((l) => l.linkId !== link.linkId));
      toast.success(`Link to ${link.other.key} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove link");
    }
  }

  // Blocked-by banner: any inward BLOCKS from an issue that is not done.
  const blockers = links.filter(
    (l) => l.type === "BLOCKS" && l.direction === "inward" && l.other.statusCategory !== "DONE"
  );

  const sorted = [...links].sort(
    (a, b) =>
      LINK_TYPE_ORDER.indexOf(a.type) - LINK_TYPE_ORDER.indexOf(b.type) ||
      a.other.key.localeCompare(b.other.key)
  );

  return (
    <section className="mt-5" aria-label="Linked issues">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          <Link2 className="h-3 w-3" aria-hidden />
          Linked issues {links.length > 0 && `(${links.length})`}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
          >
            {adding ? "Cancel" : "Link issue"}
          </button>
        )}
      </div>

      {/* Blocked-by warning */}
      {blockers.length > 0 && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Blocked</span> by{" "}
            {blockers.map((b, i) => (
              <span key={b.linkId}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
                  onClick={() => setOpenIssue(b.other.id)}
                >
                  {b.other.key}
                </button>
              </span>
            ))}{" "}
            — work on this may be impeded until {blockers.length === 1 ? "it is" : "they are"} done.
          </span>
        </div>
      )}

      {/* Add-link composer */}
      {adding && (
        <div ref={boxRef} className="relative mb-2.5 space-y-2 rounded-lg border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              Link type
            </span>
            <button
              type="button"
              aria-label="Close link composer"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setAdding(false)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {LINK_TYPE_ORDER.map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(t)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                    active
                      ? "border-transparent " + meta.tint
                      : "border-border bg-background text-muted-foreground hover:border-stone-300"
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setOpen(false);
                }
              }}
              placeholder={`Search an issue to link from ${issueKey}…`}
              aria-label="Search issue to link"
              autoFocus
              className={cn(
                "h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-xs outline-none",
                "placeholder:text-muted-foreground/70 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/30"
              )}
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            )}

            {open && (
              <div
                role="listbox"
                aria-label="Search results"
                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
              >
                {results.length === 0 && !searching && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">No issues match “{query}”.</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={submitting}
                    onClick={() => void createLink(r)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
                  >
                    <IssueTypeIcon type={r.type} size={12} />
                    <KeyBadge>{r.key}</KeyBadge>
                    <span className="min-w-0 flex-1 truncate">{r.summary}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: r.status.color }} aria-hidden />
                      {r.status.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground/70">
            Tip: pick <span className="font-medium">{TYPE_META[type].label.toLowerCase()}</span> then choose the other
            issue — “{issueKey} {TYPE_META[type].outward} <span className="font-mono text-[10px]">KEY-n</span>”.
          </p>
        </div>
      )}

      {/* Link rows */}
      {sorted.length > 0 ? (
        <ul className="space-y-1">
          {sorted.map((link) => {
            const meta = TYPE_META[link.type];
            const Icon = meta.icon;
            const done = link.other.statusCategory === "DONE";
            return (
              <li
                key={link.linkId}
                className="group flex items-center gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5 transition-colors hover:border-amber-400/50 hover:bg-muted/60"
              >
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", meta.tint)} title={meta.label}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <button
                  type="button"
                  onClick={() => setOpenIssue(link.other.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  title={`${issueKey} ${verbPhrase(link)} ${link.other.key}`}
                >
                  <span className="shrink-0 text-[11px] text-muted-foreground">{verbPhrase(link)}</span>
                  <IssueTypeIcon type={{ name: link.other.typeName, icon: link.other.typeIcon, color: link.other.typeColor }} size={12} />
                  <KeyBadge>{link.other.key}</KeyBadge>
                  <span className={cn("min-w-0 flex-1 truncate text-xs", done && "text-muted-foreground/70 line-through")}>
                    {link.other.summary}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/80">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: link.other.statusColor }} aria-hidden />
                    {link.other.statusName}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    title="Remove link"
                    aria-label={`Remove link to ${link.other.key}`}
                    onClick={() => void removeLink(link)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !adding && (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground/70">
            No linked issues yet — connect blockers, duplicates or related work.
          </p>
        )
      )}
    </section>
  );
}
