"use client";

/**
 * Webhooks admin view (blueprint §38) — register signed endpoints, browse
 * delivery logs, send test pings, and inspect the built-in receiver's log
 * (which proves the HMAC X-Signature round-trip).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RadioTower,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { apiWebhooks } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type {
  ReceiverPing,
  WebhookDTO,
  WebhookDeliveryDTO,
} from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";

const EVENTS: { value: string; label: string }[] = [
  { value: "issue.created", label: "Issue created" },
  { value: "issue.updated", label: "Issue updated" },
  { value: "issue.status_changed", label: "Status changed" },
  { value: "issue.deleted", label: "Issue deleted" },
  { value: "comment.created", label: "Comment added" },
  { value: "sprint.completed", label: "Sprint completed" },
];

const RECEIVER_URL =
  typeof window !== "undefined" ? `${window.location.origin}/api/webhook-receiver` : "/api/webhook-receiver";

function eventLabel(value: string): string {
  return EVENTS.find((e) => e.value === value)?.label ?? value;
}

function StatusPill({ d }: { d: WebhookDeliveryDTO }) {
  const ok = d.status === "SUCCESS";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300"
      )}
      title={d.error ?? undefined}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
      {d.responseCode ?? "ERR"}
    </span>
  );
}

function WebhookCard({
  hook,
  canManage,
  onChanged,
  onEdit,
  onDelete,
}: {
  hook: WebhookDTO;
  canManage: boolean;
  onChanged: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function toggle(active: boolean) {
    try {
      await apiWebhooks.patch(hook.id, { active });
      toast.success(active ? "Webhook enabled" : "Webhook paused");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update webhook");
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await apiWebhooks.sendTest(hook.id);
      if (r.status === "SUCCESS") {
        toast.success(`Test delivered — receiver responded ${r.responseCode} in ${r.durationMs} ms`);
      } else {
        toast.error(`Test failed: ${r.error ?? "no response"}`);
      }
      setExpanded(true);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  const lastOk = hook.deliveries.find((d) => d.status === "SUCCESS");

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        hook.active ? "border-border" : "border-dashed border-border opacity-80"
      )}
    >
      <div className="flex flex-wrap items-start gap-3 p-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            hook.active
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Globe className="h-4.5 w-4.5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={hook.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[13px] font-medium text-foreground hover:text-amber-700 dark:hover:text-amber-400"
              title={hook.url}
            >
              <span className="truncate">{hook.url.replace(/^https?:\/\//, "")}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </a>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                hook.active
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                  : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
              )}
            >
              {hook.active ? "Active" : "Paused"}
            </span>
          </div>
          {hook.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{hook.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {hook.events.map((e) => (
              <span
                key={e}
                className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {e}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Switch
            checked={hook.active}
            onCheckedChange={(v) => void toggle(v)}
            disabled={!canManage}
            aria-label={`Toggle webhook ${hook.url}`}
          />
          {canManage && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => void sendTest()} disabled={testing}>
                {testing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Zap className="h-3 w-3" aria-hidden />}
                Test
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onEdit}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                onClick={onDelete}
                aria-label={`Delete webhook ${hook.url}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delivery log */}
      <div className="border-t border-border/60">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
        >
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3 w-3" aria-hidden />
            Recent deliveries ({hook.deliveries.length})
            {lastOk && (
              <span className="ml-1 font-normal">
                · last ok {formatDistanceToNow(new Date(lastOk.createdAt), { addSuffix: true })}
              </span>
            )}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
        {expanded && (
          <ul className="max-h-56 overflow-y-auto border-t border-border/40 px-4 py-2 text-xs">
            {hook.deliveries.length === 0 && (
              <li className="py-2 text-muted-foreground">No deliveries yet — send a test ping.</li>
            )}
            {hook.deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-2 border-b border-border/30 py-1.5 last:border-0">
                <StatusPill d={d} />
                <span className="font-mono text-[11px] text-muted-foreground">{d.event}</span>
                {d.durationMs != null && <span className="text-[10px] tabular-nums text-muted-foreground/80">{d.durationMs} ms</span>}
                {d.error && <span className="truncate text-[10px] text-red-600 dark:text-red-400">{d.error}</span>}
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                  <RelativeTime date={d.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WebhookDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: WebhookDTO | null;
  onSaved: (secret?: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["issue.created", "issue.status_changed"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setUrl(editing.url);
      setDescription(editing.description ?? "");
      setEvents(editing.events);
    } else {
      setUrl("");
      setDescription("");
      setEvents(["issue.created", "issue.status_changed"]);
    }
  }, [open, editing]);

  function toggleEvent(value: string) {
    setEvents((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));
  }

  async function save() {
    if (!url.trim()) {
      toast.error("URL is required");
      return;
    }
    if (!events.length) {
      toast.error("Select at least one event");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await apiWebhooks.patch(editing.id, { url: url.trim(), events, description: description.trim() || null });
        toast.success("Webhook updated");
        onSaved();
      } else {
        const { secret } = await apiWebhooks.create({
          url: url.trim(),
          events,
          description: description.trim() || undefined,
        });
        onSaved(secret);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save webhook");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit webhook" : "Register a webhook"}</DialogTitle>
          <DialogDescription>
            ProjectOS will POST a signed JSON envelope for each subscribed event. Verify deliveries with the
            <span className="mx-1 font-mono text-[11px]">X-Signature</span>header (HMAC-SHA256 of the raw body).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">Payload URL</Label>
            <Input
              id="wh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/projectos"
              className="font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setUrl(RECEIVER_URL)}
              className="text-[11px] font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              Use the built-in test receiver →
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>Subscribe to events</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Webhook events">
              {EVENTS.map((e) => {
                const on = events.includes(e.value);
                return (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => toggleEvent(e.value)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                      on
                        ? "border-amber-500/70 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                        : "border-border bg-card text-muted-foreground hover:border-amber-400/50 hover:text-foreground"
                    )}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wh-desc">Description (optional)</Label>
            <Textarea
              id="wh-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this endpoint do?"
              className="min-h-16 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Create webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-600" aria-hidden />
            Signing secret
          </DialogTitle>
          <DialogDescription>
            Copy it now — it is shown only once. Store it in your receiver to verify
            <span className="mx-1 font-mono text-[11px]">X-Signature: sha256=…</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/40">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-amber-900 dark:text-amber-200">{secret}</code>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            onClick={() => {
              void navigator.clipboard.writeText(secret ?? "").then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Copy className="h-3 w-3" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Live log of what the built-in receiver accepted — proves signing round-trip. */
function ReceiverLog() {
  const [pings, setPings] = useState<ReceiverPing[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiWebhooks
        .receiverPings()
        .then((r) => alive && setPings(r.pings))
        .catch(() => alive && setPings([]));
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <RadioTower className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <h3 className="text-sm font-semibold">Built-in test receiver</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">POST /api/webhook-receiver</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Point any webhook at this endpoint to see deliveries land in seconds. It verifies the HMAC signature of every
        delivery and shows the verdict below.
      </p>
      <ul className="mt-3 space-y-1.5">
        {pings === null && <Skeleton className="h-8 w-full" />}
        {pings?.length === 0 && (
          <li className="rounded-md border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
            No pings received yet — hit “Test” on a webhook pointing here.
          </li>
        )}
        {pings?.slice(0, 6).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                p.verified
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                  : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
              )}
              title={p.verified ? "HMAC signature verified" : "No valid signature"}
            >
              {p.verified ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <BellRing className="h-3 w-3" aria-hidden />}
              {p.verified ? "signed" : "unsigned"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{p.event ?? "unknown"}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/70">
              <RelativeTime date={p.at} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WebhooksView() {
  const role = usePortalStore((s) => s.role);
  const canManage = role === "ADMIN" || role === "MANAGER";

  const [hooks, setHooks] = useState<WebhookDTO[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookDTO | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiWebhooks.list();
      setHooks(r.webhooks);
    } catch {
      setHooks([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    apiWebhooks
      .list()
      .then((r) => {
        if (alive) setHooks(r.webhooks);
      })
      .catch(() => {
        if (alive) setHooks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function remove() {
    if (!deleteTarget) return;
    try {
      await apiWebhooks.remove(deleteTarget.id);
      toast.success("Webhook removed");
      setDeleteTarget(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove webhook");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Webhooks</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Push signed events to external systems the moment work happens.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New webhook
          </Button>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {hooks === null && (
          <>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </>
        )}
        {hooks?.length === 0 && (
          <EmptyState
            icon={RadioTower}
            title="No webhooks yet"
            hint="Register an endpoint and ProjectOS will deliver signed JSON envelopes for the events you pick. Try the built-in receiver for a quick round-trip."
            action={
              canManage ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Register your first webhook
                </Button>
              ) : undefined
            }
          />
        )}
        {hooks?.map((h) => (
          <WebhookCard
            key={h.id}
            hook={h}
            canManage={canManage}
            onChanged={() => void load()}
            onEdit={() => {
              setEditing(h);
              setDialogOpen(true);
            }}
            onDelete={() => setDeleteTarget(h)}
          />
        ))}
      </div>

      <div className="mt-6">
        <ReceiverLog />
      </div>

      <WebhookDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={(s) => {
          void load();
          if (s) setSecret(s);
        }}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove webhook?</DialogTitle>
            <DialogDescription className="break-all">
              “{deleteTarget?.url}” and its delivery history will be removed. Existing automations are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void remove()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
