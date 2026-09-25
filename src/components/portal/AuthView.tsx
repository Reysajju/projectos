"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Columns3,
  Loader2,
  Mail,
  MailCheck,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { BrandLockup, BrandMark } from "./BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthPayload } from "@/lib/portal-types";

type Mode = "auth" | "sent" | "claim" | "claim-invalid";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const FEATURES = [
  { icon: Columns3, text: "Kanban boards, sprints & backlog planning" },
  { icon: Zap, text: "Workflow engine with audit trail & automations" },
  { icon: MailCheck, text: "Passwordless Magic Link email authentication" },
  { icon: ShieldCheck, text: "Multi-tenant workspaces with role-based access" },
] as const;

/** Reads ?claim=, ?magic=, ?auth_error= from the URL on mount. */
function useTokenParam(): {
  claimToken: string | null;
  magicToken: string | null;
  authError: string | null;
} {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { claimToken: null, magicToken: null, authError: null };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      claimToken: params.get("claim"),
      magicToken: params.get("magic"),
      authError: params.get("auth_error"),
    };
  }, []);
}

export function AuthView({ onAuthed }: { onAuthed: (payload: AuthPayload) => void }) {
  const { claimToken, magicToken, authError } = useTokenParam();
  const [mode, setMode] = useState<Mode>(claimToken ? "claim" : "auth");
  const [busy, setBusy] = useState<string | null>(null);

  // Magic link request state
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");

  // Claim invitation state
  const [claimName, setClaimName] = useState("");
  const [claimChecked, setClaimChecked] = useState(!claimToken);

  // Signup state
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function cleanUrl() {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  // ── Auto-verify ?magic=<token> from email link ──
  useEffect(() => {
    if (!magicToken) return;
    let alive = true;
    setBusy("verifying");
    toast.loading("Verifying your sign-in link…", { id: "magic-verify" });

    api
      .verifyMagicLink({ token: magicToken })
      .then((payload) => {
        if (!alive) return;
        cleanUrl();
        toast.success(`Welcome back, ${payload.user.name.split(" ")[0]}!`, { id: "magic-verify" });
        onAuthed(payload);
      })
      .catch((err) => {
        if (!alive) return;
        cleanUrl();
        toast.error(err instanceof Error ? err.message : "Sign-in link is invalid or has expired", {
          id: "magic-verify",
        });
      })
      .finally(() => {
        if (alive) setBusy(null);
      });

    return () => {
      alive = false;
    };
  }, [magicToken, onAuthed]);

  // ── Handle auth error redirect from direct GET /api/auth/magic ──
  useEffect(() => {
    if (!authError) return;
    cleanUrl();
    if (authError === "expired") {
      toast.error("Your sign-in link has expired. Please request a new one.");
    } else {
      toast.error("Sign-in link was invalid. Please enter your email to receive a fresh link.");
    }
  }, [authError]);

  // ── Validate claim invitation token ──
  useEffect(() => {
    if (!claimToken) return;
    let alive = true;
    api
      .claimInfo(claimToken)
      .then((info) => {
        if (!alive) return;
        if (info.valid) {
          setClaimName(info.name ?? "");
          setClaimChecked(true);
        } else {
          setMode("claim-invalid");
        }
      })
      .catch(() => alive && setMode("claim-invalid"));
    return () => {
      alive = false;
    };
  }, [claimToken]);

  // Send Magic Link to email
  async function doSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    setBusy("magic");
    try {
      await api.sendMagicLink({ email: cleanEmail });
      setSentEmail(cleanEmail);
      setMode("sent");
      toast.success(`Sign-in link sent to ${cleanEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send sign-in link");
    } finally {
      setBusy(null);
    }
  }

  // Resend Magic Link
  async function doResendMagicLink() {
    if (!sentEmail) return;
    setBusy("resend");
    try {
      await api.sendMagicLink({ email: sentEmail });
      toast.success(`Fresh sign-in link sent to ${sentEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend link");
    } finally {
      setBusy(null);
    }
  }

  // 1-Click Instant Demo Login
  async function doDemoLogin() {
    setBusy("demo");
    try {
      const payload = await api.demoLogin();
      toast.success(`Welcome to Acme Corp demo, ${payload.user.name.split(" ")[0]}!`);
      onAuthed(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setBusy(null);
    }
  }

  // Passwordless workspace signup
  async function doSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!orgSlug.trim()) {
      toast.error("Workspace URL slug is required");
      return;
    }
    setBusy("signup");
    try {
      const payload = await api.signup({
        email: suEmail.trim(),
        name: suName.trim(),
        orgName: orgName.trim(),
        orgSlug: orgSlug.trim(),
      });
      toast.success("Workspace created — welcome to ProjectOS!");
      onAuthed(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(null);
    }
  }

  // Passwordless claim invitation
  async function doClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!claimToken) return;
    setBusy("claim");
    try {
      const payload = await api.claimAccount({
        token: claimToken,
        name: claimName.trim() || undefined,
      });
      cleanUrl();
      toast.success(`Account ready — welcome, ${payload.user.name.split(" ")[0]}!`);
      onAuthed(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set up your account");
    } finally {
      setBusy(null);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Magic Link Sent State
  // ────────────────────────────────────────────────────────────
  if (mode === "sent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
              <MailCheck className="size-7 text-amber-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We sent a passwordless sign-in link to:
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground bg-muted/60 py-1.5 px-3 rounded-md inline-block">
              {sentEmail}
            </p>
            <p className="mt-4 text-xs text-muted-foreground/80">
              Click the button in your email to sign in instantly. The link is valid for 30 minutes.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => void doResendMagicLink()}
                disabled={busy !== null}
              >
                {busy === "resend" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                )}
                Resend email
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => {
                  setMode("auth");
                  setEmail(sentEmail);
                }}
              >
                Use a different email
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Claim Invitation State
  // ────────────────────────────────────────────────────────────
  if (mode === "claim" || mode === "claim-invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => setMode("auth")}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to sign in
          </button>

          {mode === "claim" && (
            <form
              className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
              onSubmit={doClaim}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30">
                  <UserPlus className="size-5 text-amber-600" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Join your team</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {claimChecked
                      ? "You've been invited to collaborate on ProjectOS. Confirm your name to activate your account."
                      : "Validating your invitation link…"}
                  </p>
                </div>
              </div>
              {claimChecked && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="claim-name">Your display name</Label>
                    <Input
                      id="claim-name"
                      required
                      placeholder="Ada Lovelace"
                      value={claimName}
                      onChange={(e) => setClaimName(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700" disabled={busy !== null}>
                    {busy === "claim" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
                    Join workspace
                  </Button>
                </>
              )}
            </form>
          )}

          {mode === "claim-invalid" && (
            <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Invitation expired or invalid</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This invitation link cannot be used. Please ask your workspace administrator to resend your invite.
              </p>
              <Button variant="outline" className="mt-4 w-full" onClick={() => setMode("auth")}>
                Return to sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Main Passwordless Auth Screen
  // ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 p-10 text-stone-100 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-amber-600/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-amber-600/5 blur-3xl"
        />

        <BrandLockup size={40} dark />

        <div className="relative">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Ship work, not status meetings.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-400">
            Boards, backlogs, sprints, reports and notifications — one passwordless portal for your whole
            organization, from first ticket to release.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-stone-300">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-800/80 ring-1 ring-stone-700/60">
                  <f.icon className="size-4 text-amber-500" aria-hidden />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-stone-500">
          © {new Date().getFullYear()} ProjectOS · Passwordless Project Management
        </p>
      </aside>

      {/* Auth card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandMark size={36} />
            <span className="text-lg font-semibold text-foreground">
              Project<span className="text-amber-600">OS</span>
            </span>
          </div>

          <Tabs defaultValue="login">
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="login" className="gap-1.5">
                <Mail className="size-3.5" aria-hidden /> Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="gap-1.5">
                <UserPlus className="size-3.5" aria-hidden /> New workspace
              </TabsTrigger>
            </TabsList>

            {/* ── Sign In (Passwordless Magic Link) ── */}
            <TabsContent value="login">
              <form
                className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
                onSubmit={doSendMagicLink}
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Welcome back</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter your email to receive a passwordless sign-in link.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-email">Work email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700"
                  disabled={busy !== null}
                >
                  {busy === "magic" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Mail className="size-4" aria-hidden />
                  )}
                  Send Magic Link
                </Button>

                <div className="relative py-1 text-center">
                  <span className="relative z-10 bg-card px-3 text-xs uppercase tracking-wide text-muted-foreground/80">
                    or
                  </span>
                  <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-muted" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-amber-300/60 bg-amber-500/10 text-amber-600 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700/40 dark:hover:bg-amber-950/40 dark:text-amber-400"
                  disabled={busy !== null}
                  onClick={() => void doDemoLogin()}
                >
                  {busy === "demo" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  Try demo workspace
                </Button>

                <p className="text-center text-xs text-muted-foreground/80">
                  Passwordless authentication — zero passwords to create, remember, or reset.
                </p>
              </form>
            </TabsContent>

            {/* ── New Workspace (Passwordless Signup) ── */}
            <TabsContent value="signup">
              <form
                className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
                onSubmit={doSignup}
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Create your workspace</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set up an organization workspace for your team.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Your name</Label>
                    <Input
                      id="su-name"
                      required
                      placeholder="Rey Sajju"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Work email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="su-org">Workspace name</Label>
                  <Input
                    id="su-org"
                    required
                    placeholder="Acme Corp"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      if (!slugTouched) setOrgSlug(slugify(e.target.value));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-slug">Workspace URL slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md border border-border bg-muted/50 px-2 py-2 font-mono text-xs text-muted-foreground">
                      /org/
                    </span>
                    <Input
                      id="su-slug"
                      required
                      className="font-mono"
                      placeholder="acme"
                      value={orgSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setOrgSlug(slugify(e.target.value));
                      }}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700" disabled={busy !== null}>
                  {busy === "signup" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden />
                  )}
                  Create workspace &amp; sign in
                </Button>

                <p className="text-center text-xs text-muted-foreground/80">
                  Default issue types, statuses, priorities, and boards are provisioned automatically.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
