"use client";

import { useEffect, useRef } from "react";
import {
  AlarmClock,
  ArrowLeftRight,
  AtSign,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleDot,
  FolderPlus,
  MessageSquare,
  Plus,
  Search,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { usePortalStore } from "@/lib/portal-store";
import type { NotificationDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { MobileNavButton } from "./Sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RelativeTime } from "./RelativeTime";

const VIEW_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  search: "Advanced Search",
  automations: "Automation",
  team: "Team",
  settings: "Settings",
};

const NOTIF_ICONS: Record<string, LucideIcon> = {
  assigned: UserPlus,
  mentioned: AtSign,
  status_changed: ArrowLeftRight,
  comment: MessageSquare,
  due_soon: AlarmClock,
  sprint: Zap,
};

function notificationIcon(type: string): LucideIcon {
  return NOTIF_ICONS[type] ?? CircleDot;
}

function NotificationsBell() {
  const notifications = usePortalStore((s) => s.notifications);
  const unread = usePortalStore((s) => s.unread);
  const refreshNotifications = usePortalStore((s) => s.refreshNotifications);
  const markAllRead = usePortalStore((s) => s.markAllRead);
  const markRead = usePortalStore((s) => s.markRead);
  const setOpenIssue = usePortalStore((s) => s.setOpenIssue);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void refreshNotifications();
    pollRef.current = setInterval(() => void refreshNotifications(), 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshNotifications]);

  function openNotification(n: NotificationDTO) {
    if (!n.read) void markRead([n.id]);
    if (n.issueId) setOpenIssue(n.issueId);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell className="size-4.5" aria-hidden />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-rose-500/100 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={unread === 0}
            onClick={() => void markAllRead()}
          >
            <CheckCheck className="size-3.5" aria-hidden /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar]:w-1.5">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
              <Bell className="size-6 text-stone-300" aria-hidden />
              <p className="text-sm font-medium text-muted-foreground">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground/80">Assignments, mentions and status changes land here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {notifications.map((n) => {
                const Icon = notificationIcon(n.type);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50",
                        !n.read && "bg-amber-500/10/60"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                          n.type === "mentioned" ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", n.read ? "font-normal text-foreground/90" : "font-semibold text-foreground")}>
                            {n.title}
                          </span>
                          {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-amber-500/100" aria-label="unread" />}
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                        <RelativeTime date={n.createdAt} className="mt-1 block text-[11px] text-muted-foreground/80" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TopBar() {
  const view = usePortalStore((s) => s.view);
  const workspace = usePortalStore((s) => s.workspace);
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  const openProject = usePortalStore((s) => s.openProject);
  const me = usePortalStore((s) => s.me);
  const setSearchOpen = usePortalStore((s) => s.setSearchOpen);
  const openCreateIssue = usePortalStore((s) => s.openCreateIssue);
  const setCreateProjectOpen = usePortalStore((s) => s.setCreateProjectOpen);
  const setView = usePortalStore((s) => s.setView);

  const project = workspace?.projects.find((p) => p.id === activeProjectId) ?? null;

  const createIssueCtx =
    view === "project" && activeProjectId
      ? ({ kind: "project" as const, projectId: activeProjectId })
      : ({ kind: "global" as const });

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
      <MobileNavButton />

      {/* Title / breadcrumb */}
      <div className="flex min-w-0 items-center gap-1.5">
        {view === "project" && project ? (
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView("projects")}
              className="rounded px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              Projects
            </button>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
            <button
              type="button"
              onClick={() => openProject(project.id)}
              className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              <span
                className="hidden shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[11px] font-semibold text-muted-foreground sm:inline"
                aria-hidden
              >
                {project.key}
              </span>
              <span className="truncate">{project.name}</span>
            </button>
          </nav>
        ) : (
          <h1 className="truncate px-1 text-sm font-semibold text-foreground">
            {VIEW_TITLES[view] ?? "ProjectOS"}
          </h1>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Search */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search issues and projects"
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 sm:w-56 lg:w-64"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-border bg-card px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>

        <NotificationsBell />

        {/* Create */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => openCreateIssue(createIssueCtx)}>
              <CircleDot className="size-4" aria-hidden /> New issue
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCreateProjectOpen(true)}>
              <FolderPlus className="size-4" aria-hidden /> New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open user menu"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <Avatar name={me.name} color={me.avatarColor} size="md" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium text-foreground">{me.name}</div>
                <div className="text-xs text-muted-foreground">{me.email}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setView("team")}>
                <UserPlus className="size-4" aria-hidden /> Team
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setView("settings")}>
                <FolderPlus className="size-4" aria-hidden /> Workspace settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
