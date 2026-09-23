"use client";

import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Columns3,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthPayload } from "@/lib/portal-types";

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
  { icon: Bell, text: "Real-time notifications and @mentions" },
  { icon: ShieldCheck, text: "Multi-tenant workspaces with role-based access" },
] as const;

export function AuthView({ onAuthed }: { onAuthed: (payload: AuthPayload) => void }) {
  const [busy, setBusy] = useState<"login" | "signup" | "demo" | null>(null);

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

        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-amber-600 text-lg font-bold text-white shadow-lg shadow-amber-600/20">
            P
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">ProjectOS</div>
            <div className="text-xs text-stone-400">Project Management Portal</div>
          </div>
        </div>

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
          © {new Date().getFullYear()} ProjectOS · Multi-tenant demo workspace
        </p>
      </aside>

      {/* Auth card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600 text-base font-bold text-white">
              P
            </div>
            <span className="text-lg font-semibold text-foreground">ProjectOS</span>
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
                  <Label htmlFor="login-password">Password</Label>
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
