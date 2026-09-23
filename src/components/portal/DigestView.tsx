"use client";

/**
 * DigestView — email digest center (blueprint §34).
 *
 * • Left: schedule explainer + send controls (self always; everyone for
 *   ADMIN/MANAGER) + kind switch (daily / weekly).
 * • Right: email-client-style preview of the current user's digest — header
 *   (from/to/subject) + monospace plain-text body, exactly what the SMTP
 *   provider would deliver.
 * • Bottom (manageOnly): outbox log — the last 50 recorded deliveries.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Clock,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { apiDigest } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { DigestKindDTO, DigestPreviewPayload, EmailsPayload } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "./RelativeTime";
import { EmptyState } from "./EmptyState";

export function DigestView() {
  const role = usePortalStore((s) => s.role);
  const canManage = role === "ADMIN" || role === "MANAGER";

  const [kind, setKind] = useState<DigestKindDTO>("DAILY");
  const [preview, setPreview] = useState<DigestPreviewPayload | null>(null);
  const [log, setLog] = useState<EmailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<"me" | "all" | null>(null);
  const [pruning, setPruning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([
        apiDigest.preview(kind),
        canManage ? apiDigest.log() : Promise.resolve(null),
      ]);
      setPreview(p);
      setLog(l);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load digest");
    } finally {
      setLoading(false);
    }
  }, [kind, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendTo(scope: "me" | "all") {
    setSending(scope);
    try {
      const res = await apiDigest.send(
        scope === "all" ? { kind, all: true } : { kind }
      );
      toast.success(
        res.sent === 1
          ? `Test ${res.kind.toLowerCase()} digest queued — see the outbox below`
          : `${res.sent} ${res.kind.toLowerCase()} digests queued — see the outbox below`
      );
      const l = canManage ? await apiDigest.log() : null;
      setLog(l);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send digest");
    } finally {
      setSending(null);
    }
  }

  const overdueCount = preview?.counts.overdue ?? 0;

  async function pruneOutbox() {
    setPruning(true);
    try {
      const res = await apiDigest.prune();
      toast.success(
        res.deleted > 0
          ? `Pruned ${res.deleted} delivery${res.deleted === 1 ? "" : "s"} older than ${res.retentionDays} days`
          : `Outbox is clean — nothing older than ${res.retentionDays} days`
      );
      setLog(await apiDigest.log());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to prune outbox");
    } finally {
      setPruning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Email digest</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A morning summary of your work — overdue, blocked, due soon, and what shipped.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── Controls column ── */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Clock className="size-3.5 text-amber-500" aria-hidden /> Schedule
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Daily digests are generated <span className="font-medium text-foreground">every morning at 9:00</span> by
              the scheduler; weekly digests go out on Mondays. In this sandbox, deliveries are
              recorded to an auditable outbox instead of an SMTP provider.
            </p>
            <div className="mt-3 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden /> Next run: tomorrow 09:00 (Asia/Karachi)
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-foreground">Digest type</div>
            <div className="mt-2 flex items-center rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Digest type">
              {(["DAILY", "WEEKLY"] as DigestKindDTO[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "flex-1 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                    kind === k
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k.toLowerCase()}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <Button
                size="sm"
                className="w-full gap-1.5 bg-amber-600 hover:bg-amber-700"
                onClick={() => void sendTo("me")}
                disabled={sending !== null || loading}
              >
                {sending === "me" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                Send me a test digest
              </Button>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => void sendTo("all")}
                  disabled={sending !== null || loading}
                >
                  {sending === "all" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
                  Send to everyone
                </Button>
              )}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {overdueCount > 0
                ? `Heads up: ${overdueCount} of your issues are overdue — tomorrow's digest will flag them.`
                : "Nothing overdue right now — your digest will look calm."}
            </p>
          </div>
        </div>

        {/* ── Email preview ── */}
        <div className="min-w-0">
          {loading || !preview ? (
            <div className="flex h-72 items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-label="Digest email preview">
              {/* email header */}
              <div className="space-y-1.5 border-b border-border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">From</span>
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className="flex size-4 items-center justify-center rounded bg-amber-600 text-[8px] font-bold text-white">P</span>
                    ProjectOS &lt;digest@projectos.app&gt;
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">To</span>
                  <span className="truncate text-foreground">
                    {preview.recipient.name} &lt;{preview.recipient.email}&gt;
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">Subject</span>
                  <span className="font-semibold text-foreground">{preview.subject}</span>
                </div>
              </div>
              {/* email body — the exact plain-text payload */}
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-foreground/90 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar]:w-1.5">
                {preview.text}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Outbox (manageOnly) ── */}
      {canManage && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <MailCheck className="size-3.5 text-amber-500" aria-hidden /> Outbox — recent deliveries
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {log ? (log.total > log.emails.length ? `last ${log.emails.length} of ${log.total}` : `${log.total} recorded`) : "…"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void pruneOutbox()}
                disabled={pruning}
                title="Delete deliveries older than the retention window"
              >
                {pruning ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Trash2 className="size-3" aria-hidden />}
                Clean up
              </Button>
            </div>
          </div>
          {log && log.emails.length > 0 ? (
            <div className="max-h-80 overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar]:w-1.5">
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {log.emails.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{e.subject}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        to {e.toName ?? e.toEmail} · {e.kind.replace("_", " ").toLowerCase()} · via {e.trigger ?? "manual"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        e.status === "SIMULATED" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                        e.status === "SENT" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        e.status === "FAILED" && "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {e.status}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                      <RelativeTime date={e.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="px-4 py-8">
              <EmptyState
                icon={Inbox}
                title="No deliveries yet"
                hint="Use “Send me a test digest” to generate the first one."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
