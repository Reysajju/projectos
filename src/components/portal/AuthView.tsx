"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Columns3,
  KeyRound,
  Loader2,
  LogIn,
  MailCheck,
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

type Mode = "auth" | "claim" | "claim-invalid" | "forgot" | "forgot-sent" | "reset";

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
  { icon: MailCheck, text: "Email on invites, assignments, comments & digests" },
  { icon: ShieldCheck, text: "Multi-tenant workspaces with role-based access" },
] as const;

/** Reads ?claim= / ?reset= from the URL once on mount. */
function useTokenParam(): { claimToken: string | null; resetToken: string | null } {
  return useMemo(() => {
    if (typeof window === "undefined") return { claimToken: null, resetToken: null };
    const params = new URLSearchParams(window.location.search);
    return {
      claimToken: params.get("claim"),
      resetToken: params.get("reset"),
    };
  }, []);
}

export function AuthView({ onAuthed }: { onAuthed: (payload: AuthPayload) => void }) {
  const { claimToken, resetToken } = useTokenParam();
  const [mode, setMode] = useState<Mode>(claimToken ? "claim" : resetToken ? "reset" : "auth");

  const [busy, setBusy] = useState<string | null>(null);

  // claim
  const [claimName, setClaimName] = useState("");
  const [claimPassword, setClaimPassword] = useState("");
  const [claimChecked, setClaimChecked] = useState(!claimToken);

  // reset
  const [resetPassword, setResetPassword] = useState("");

  // forgot
  const [fpEmail, setFpEmail] = useState("");

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // signup
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // ── Validate claim token ──
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

  function cleanUrl() {
    window.history.replaceState({}, "", window.location.pathname);
  }

  async function doLogin(emailVal: string, passwordVal: string, kind: "login" | "demo") {
    setBusy(kind);
    try {
      const payload = await api.login({ email: emailVal, password: passwordVal });
      toast.success(`Welcome back, ${payload.user.name.split(" ")[0]}!`);
      onAuthed(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

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
        password: suPassword,
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

  async function doClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!claimToken) return;
    setBusy("claim");
    try {
      const payload = await api.claimAccount({
        token: claimToken,
        name: claimName.trim() || undefined,
        password: claimPassword,
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

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetToken) return;
    setBusy("reset");
    try {
      const payload = await api.resetPassword({ token: resetToken, password: resetPassword });
      cleanUrl();
      toast.success("Password updated — you are signed in.");
      onAuthed(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(null);
    }
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy("forgot");
    try {
      await api.forgotPassword({ email: fpEmail.trim() });
      setMode("forgot-sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Standalone flows (claim / reset / forgot)
  // ────────────────────────────────────────────────────────────
  if (mode !== "auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => setMode("auth")}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to log in
          </button>

          {/* Claim invitation */}
          {mode === "claim" && (
            <form
              className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
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
                      ? "You've been invited to a ProjectOS workspace. Choose a password to activate your account."
                      : "Validating your invitation link…"}
                  </p>
                </div>
              </div>
              {claimChecked && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="claim-name">Your name</Label>
                    <Input
                      id="claim-name"
                      required
                      placeholder="Ada Lovelace"
                      value={claimName}
                      onChange={(e) => setClaimName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="claim-password">Choose a password</Label>
                    <Input
                      id="claim-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={claimPassword}
                      onChange={(e) => setClaimPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700" disabled={busy !== null}>
                    {busy === "claim" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
                    Activate account
                  </Button>
                </>
              )}
            </form>
          )}

          {mode === "claim-invalid" && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-500/10">
                <KeyRound className="size-6 text-rose-600" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Invitation link expired</h2>
              <p className="text-sm text-muted-foreground">
                This link is invalid, already used, or older than 7 days. Ask your workspace admin to
                resend the invitation from <strong>Team → member menu → Resend invite</strong>.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setMode("auth")}>
                Go to log in
              </Button>
            </div>
          )}

          {/* Reset password */}
          {mode === "reset" && (
            <form
              className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
              onSubmit={doReset}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30">
                  <KeyRound className="size-5 text-amber-600" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Choose a new password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick something strong — you&apos;ll be signed in automatically afterwards.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700" disabled={busy !== null}>
                {busy === "reset" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Update password
              </Button>
            </form>
          )}

          {/* Forgot password */}
          {(mode === "forgot" || mode === "forgot-sent") && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
              {mode === "forgot" ? (
                <form className="space-y-4" onSubmit={doForgot}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30">
                      <KeyRound className="size-5 text-amber-600" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Forgot your password?</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter your email and we&apos;ll send a reset link (valid for 1 hour).
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fp-email">Email</Label>
                    <Input
                      id="fp-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700" disabled={busy !== null}>
                    {busy === "forgot" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Send reset link
                  </Button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
                    <MailCheck className="size-6 text-emerald-600" aria-hidden />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Check your inbox</h2>
                  <p className="text-sm text-muted-foreground">
                    If an account exists for <strong>{fpEmail}</strong>, a password-reset link is on
                    its way. It expires in one hour.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => setMode("auth")}>
                    Back to log in
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Standard log in / sign up
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
            Boards, backlogs, sprints, reports and notifications — one portal for your whole
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
          © {new Date().getFullYear()} ProjectOS · Self-hosted project management
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
                <LogIn className="size-3.5" aria-hidden /> Log in
              </TabsTrigger>
              <TabsTrigger value="signup" className="gap-1.5">
                <UserPlus className="size-3.5" aria-hidden /> Sign up
              </TabsTrigger>
            </TabsList>

            {/* ── Login ── */}
            <TabsContent value="login">
              <form
                className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doLogin(email.trim(), password, "login");
                }}
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Welcome back</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Log in to your organization workspace.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={busy !== null}>
                  {busy === "login" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
                  Log in
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
                  className="w-full gap-2 border-amber-300 bg-amber-500/10 text-amber-600 hover:bg-amber-100 hover:text-amber-900"
                  disabled={busy !== null}
                  onClick={() => void doLogin("sarah@acme.dev", "demo1234", "demo")}
                >
                  {busy === "demo" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                  Try demo account
                </Button>
                <p className="text-center text-xs text-muted-foreground/80">
                  Demo org “Acme Corp” — seeded projects, sprints & reports.
                </p>
              </form>
            </TabsContent>

            {/* ── Sign up ── */}
            <TabsContent value="signup">
              <form
                className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
                onSubmit={doSignup}
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Create your workspace</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You&apos;ll be the organization admin.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Your name</Label>
                    <Input
                      id="su-name"
                      required
                      placeholder="Ada Lovelace"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
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
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-org">Organization name</Label>
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
                <Button type="submit" className="w-full gap-2" disabled={busy !== null}>
                  {busy === "signup" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden />
                  )}
                  Create workspace
                </Button>
                <p className="text-center text-xs text-muted-foreground/80">
                  A workspace with default issue types, statuses &amp; priorities is provisioned automatically.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
