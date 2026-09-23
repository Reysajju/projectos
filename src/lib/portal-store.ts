// ProjectOS — global portal state (zustand). Single SPA on `/`, client-side
// view switching. Backend sync happens through src/lib/api-client.ts.

import { create } from "zustand";
import { api } from "./api-client";
import type { NotificationDTO, OrgDTO, UserDTO, WorkspacePayload } from "./portal-types";

export type PortalView = "dashboard" | "projects" | "project" | "team" | "settings" | "search" | "automations" | "workflow";
export type ProjectTab = "board" | "backlog" | "roadmap" | "issues" | "reports" | "settings";

export type CreateIssueContext =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

interface PortalState {
  // ─── Session ──────────────────────────────────────────────────
  me: UserDTO | null;
  org: OrgDTO | null;
  role: string | null;
  workspace: WorkspacePayload | null;
  workspaceLoading: boolean;

  setSession: (payload: { user: UserDTO; org: OrgDTO; role: string }) => void;
  setWorkspace: (ws: WorkspacePayload) => void;
  refreshWorkspace: () => Promise<void>;
  resetSession: () => void;

  // ─── Navigation ───────────────────────────────────────────────
  view: PortalView;
  activeProjectId: string | null;
  projectTab: ProjectTab;
  openIssueId: string | null;
  /** Bumped whenever project data should be refetched (issue patched elsewhere). */
  projectDataVersion: number;

  setView: (view: PortalView) => void;
  openProject: (projectId: string, tab?: ProjectTab) => void;
  setProjectTab: (tab: ProjectTab) => void;
  setOpenIssue: (issueId: string | null) => void;
  bumpProjectData: () => void;

  // ─── Global dialogs ───────────────────────────────────────────
  createIssue: CreateIssueContext | null;
  openCreateIssue: (ctx?: CreateIssueContext) => void;
  closeCreateIssue: () => void;

  createProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;

  /** Query preseeded when opening the advanced search view from elsewhere. */
  searchSeedQuery: string | null;
  openSearch: (query?: string) => void;
  clearSearchSeed: () => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;

  // ─── Notifications ────────────────────────────────────────────
  notifications: NotificationDTO[];
  unread: number;
  setNotifications: (notifications: NotificationDTO[], unread: number) => void;
  refreshNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
}

export const usePortalStore = create<PortalState>((set, get) => ({
  // ─── Session ──────────────────────────────────────────────────
  me: null,
  org: null,
  role: null,
  workspace: null,
  workspaceLoading: false,

  setSession: ({ user, org, role }) => set({ me: user, org, role }),

  setWorkspace: (ws) =>
    set({
      workspace: ws,
      me: ws.user,
      org: ws.org,
      role: ws.role,
      workspaceLoading: false,
    }),

  refreshWorkspace: async () => {
    try {
      const ws = await api.workspace();
      get().setWorkspace(ws);
    } catch (err) {
      console.error("Failed to refresh workspace", err);
    }
  },

  resetSession: () =>
    set({
      me: null,
      org: null,
      role: null,
      workspace: null,
      workspaceLoading: false,
      view: "dashboard",
      activeProjectId: null,
      projectTab: "board",
      openIssueId: null,
      notifications: [],
      unread: 0,
    }),

  // ─── Navigation ───────────────────────────────────────────────
  view: "dashboard",
  activeProjectId: null,
  projectTab: "board",
  openIssueId: null,
  projectDataVersion: 0,

  setView: (view) => set({ view }),

  openProject: (projectId, tab = "board") =>
    set({ view: "project", activeProjectId: projectId, projectTab: tab, openIssueId: null }),

  setProjectTab: (tab) => set({ projectTab: tab }),

  setOpenIssue: (issueId) => set({ openIssueId: issueId }),

  bumpProjectData: () => set((s) => ({ projectDataVersion: s.projectDataVersion + 1 })),

  // ─── Global dialogs ───────────────────────────────────────────
  createIssue: null,
  openCreateIssue: (ctx) => set({ createIssue: ctx ?? { kind: "global" } }),
  closeCreateIssue: () => set({ createIssue: null }),

  searchSeedQuery: null,
  openSearch: (query) => set({ view: "search", searchSeedQuery: query ?? null }),
  clearSearchSeed: () => set({ searchSeedQuery: null }),

  createProjectOpen: false,
  setCreateProjectOpen: (open) => set({ createProjectOpen: open }),

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  // ─── Notifications ────────────────────────────────────────────
  notifications: [],
  unread: 0,

  setNotifications: (notifications, unread) => set({ notifications, unread }),

  refreshNotifications: async () => {
    try {
      const payload = await api.notifications();
      set({ notifications: payload.notifications, unread: payload.unread });
    } catch (err) {
      console.error("Failed to refresh notifications", err);
    }
  },

  markAllRead: async () => {
    try {
      await api.markNotificationsRead([]);
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unread: 0,
      }));
    } catch (err) {
      console.error("Failed to mark notifications read", err);
    }
  },

  markRead: async (ids) => {
    if (!ids.length) return;
    try {
      await api.markNotificationsRead(ids);
      const idSet = new Set(ids);
      set((s) => {
        const notifications = s.notifications.map((n) =>
          idSet.has(n.id) ? { ...n, read: true } : n
        );
        return { notifications, unread: notifications.filter((n) => !n.read).length };
      });
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  },
}));

export function useIsAdmin() {
  const role = usePortalStore((s) => s.role);
  return role === "ADMIN";
}

export function useCanManage() {
  const role = usePortalStore((s) => s.role);
  return role === "ADMIN" || role === "MANAGER";
}
