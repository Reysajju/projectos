"use client";

/**
 * API keys admin view (blueprint §38 second half) — mint scoped Bearer tokens
 * for programmatic access. Raw tokens are shown exactly once; only a sha256
 * hash + display prefix are stored. Scopes map to effective roles:
 * read → VIEWER, write → MEMBER (never ADMIN/MANAGER).
 */

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";

import { apiKeys } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { ApiKeyDTO } from "@/lib/portal-types";
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
import { EmptyState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";

function copyText(text: string, what: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what} copied`))
    .catch(() => toast.error("Couldn't copy"));
}

export function ApiKeysView() {
  const role = usePortalStore((s) => s.role);
  const canManage = role === "ADMIN" || role === "MANAGER";

  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [writeScope, setWriteScope] = useState(false);
  const [creating, setCreating] = useState(false);

  const [minted, setMinted] = useState<{ token: string; name: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDTO | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const payload = await apiKeys.list();
      setKeys(payload.keys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load API keys");
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [canManage]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const scopes = writeScope ? ["read", "write"] : ["read"];
      const r = await apiKeys.create({ name: name.trim(), scopes });
      setMinted({ token: r.token, name: r.key.name });
      setCreateOpen(false);
      setName("");
      setWriteScope(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    try {
      await apiKeys.revoke(revokeTarget.id);
      toast.success(`"${revokeTarget.name}" revoked`);
      setRevokeTarget(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  const curlExample = [
    "curl -s https://your-host/api/search?q=status=\\\"in progress\\\" \\",
    '  -H "Authorization: Bearer posk_YOUR_TOKEN"',
  ].join(" \\\n");

  if (!canManage) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={ShieldAlert}
          title="API keys are admin-only"
          hint="Ask an ADMIN or MANAGER to mint a token for you."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 lg:p-6">
      {/* Usage panel */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <TerminalSquare className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Programmatic access</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Call any <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/api/*</code> endpoint
              with a Bearer token — no browser session needed. Scopes:{" "}
              <span className="font-medium text-foreground/80">read</span> acts as a viewer,{" "}
              <span className="font-medium text-foreground/80">write</span> can create and edit issues.
              Admin endpoints (webhooks, workflow, keys) stay off-limits to tokens.
            </p>
            <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-muted/70 p-2.5">
              <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/80" aria-label="curl example">
{curlExample}
              </pre>
              <button
                type="button"
                aria-label="Copy curl example"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => copyText(curlExample, "curl example")}
              >
                <Copy className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Keys list */}
      <section aria-label="API keys">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden />
              Keys
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tokens are stored as sha256 hashes — the raw value is shown once at creation.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden /> Create key
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !keys || keys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border">
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              hint="Create a scoped token for CI pipelines, scripts or integrations."
            />
          </div>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-3.5 transition-colors",
                  k.revoked && "opacity-60"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <KeyRound className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{k.name}</span>
                      {k.revoked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/70 dark:text-red-300">
                          <Ban className="size-2.5" aria-hidden /> Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          <BadgeCheck className="size-2.5" aria-hidden /> Active
                        </span>
                      )}
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            s === "write"
                              ? "bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300"
                              : "bg-stone-100 text-stone-700 dark:bg-stone-800/80 dark:text-stone-300"
                          )}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground/80">
                      <code className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-foreground/70">
                        {k.prefix}…
                      </code>
                      <span aria-hidden>·</span>
                      <span>
                        {k.lastUsedAt ? (
                          <>
                            last used <RelativeTime date={k.lastUsedAt} />
                          </>
                        ) : (
                          "never used"
                        )}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        by {k.creator.name} <RelativeTime date={k.createdAt} prefix="· " />
                      </span>
                    </div>
                  </div>
                  {!k.revoked && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:hover:bg-red-950/40 dark:text-red-400"
                      onClick={() => setRevokeTarget(k)}
                    >
                      <Ban className="size-3" aria-hidden /> Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Scope the key to the least access it needs. You can revoke it any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="apikey-name">Name</Label>
              <Input
                id="apikey-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CI pipeline, Grafana widget"
                onKeyDown={(e) => e.key === "Enter" && void create()}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="apikey-write" className="text-sm font-medium">
                  Write access
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {writeScope ? "Can create and edit issues, comments, sprints." : "Read-only (viewer) access."}
                </p>
              </div>
              <Switch id="apikey-write" checked={writeScope} onCheckedChange={setWriteScope} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
              disabled={!name.trim() || creating}
              onClick={() => void create()}
            >
              {creating && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time token dialog */}
      <Dialog open={minted !== null} onOpenChange={(o) => !o && setMinted(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy your token now</DialogTitle>
            <DialogDescription>
              This is the only time the full token for{" "}
              <span className="font-semibold text-foreground">{minted?.name}</span> is shown. Store it
              somewhere safe — we keep only a hash.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-950/30">
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground/90">
                {minted?.token}
              </code>
              <button
                type="button"
                aria-label="Copy token"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  if (minted) copyText(minted.token, "Token");
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={() => setMinted(null)}>
              I've stored it safely
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke “{revokeTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Requests using <code className="rounded bg-muted px-1 font-mono text-[11px]">{revokeTarget?.prefix}…</code>{" "}
              will immediately start failing with 401. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void revoke()}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
