"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import { AuthView } from "./AuthView";
import { Sidebar, MobileSidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DashboardView } from "./DashboardView";
import { ProjectsView } from "./ProjectsView";
import { ProjectView } from "./ProjectView";
import { TeamView } from "./TeamView";
import { SettingsView } from "./SettingsView";
import { IssuePanel } from "./IssuePanel";
import { CreateIssueDialog } from "./CreateIssueDialog";
import { GlobalCreateProjectDialog } from "./ProjectDialog";
import { SearchPalette } from "./SearchPalette";
import { Toaster } from "@/components/ui/sonner";

type AuthState = "loading" | "anon" | "authed";

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-12 animate-pulse items-center justify-center rounded-xl bg-amber-600 text-xl font-bold text-white shadow-lg shadow-amber-600/25">
        P
      </div>
      <div className="flex items-center gap-2 text-sm text-stone-400">
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:0ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:150ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:300ms]" />
        <span className="ml-1">Loading your workspace…</span>
      </div>
    </div>
  );
}

export function PortalApp() {
  const workspace = usePortalStore((s) => s.workspace);
  const setWorkspace = usePortalStore((s) => s.setWorkspace);
  const view = usePortalStore((s) => s.view);
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const [authState, setAuthState] = useState<AuthState>("loading");

  const bootstrap = useCallback(async () => {
    try {
      const ws = await api.workspace();
      setWorkspace(ws);
      setAuthState("authed");
      return true;
    } catch {
      setAuthState("anon");
      return false;
    }
  }, [setWorkspace]);

  useEffect(() => {
    let alive = true;
    api
      .workspace()
      .then((ws) => {
        if (!alive) return;
        setWorkspace(ws);
        setAuthState("authed");
      })
      .catch(() => {
        if (alive) setAuthState("anon");
      });
    return () => {
      alive = false;
    };
  }, [setWorkspace]);

  // Deep link: /?issue=WEB-12 opens the issue panel after auth
  useEffect(() => {
    if (authState !== "authed") return;
    const params = new URLSearchParams(window.location.search);
    const issueKey = params.get("issue");
    if (!issueKey) return;
    void api
      .search(issueKey)
      .then((r) => {
        const match = r.issues.find((i) => i.key.toUpperCase() === issueKey.toUpperCase());
        if (match) setOpenIssue(match.id);
      })
      .catch(() => undefined);
    // Clean the URL so refresh doesn't re-trigger
    window.history.replaceState({}, "", window.location.pathname);
  }, [authState, setOpenIssue]);

  async function handleAuthed() {
    const ok = await bootstrap();
    if (!ok) setAuthState("anon");
  }

  if (authState === "loading") return <Splash />;

  if (authState === "anon" || !workspace) {
    return (
      <>
        <AuthView onAuthed={() => void handleAuthed()} />
        <Toaster position="bottom-right" richColors closeButton />
      </>
    );
  }

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <DashboardView />;
      case "projects":
        return <ProjectsView />;
      case "project":
        return activeProjectId ? <ProjectView /> : <ProjectsView />;
      case "team":
        return <TeamView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <MobileSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="portal-main" className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view + (view === "project" ? `:${activeProjectId ?? ""}` : "")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="min-h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global overlays */}
      <IssuePanel />
      <CreateIssueDialog />
      <GlobalCreateProjectDialog />
      <SearchPalette />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
