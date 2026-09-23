"use client";

import { Archive, ChevronRight, LayoutDashboard, LogOut, Menu, Settings, UserCircle2, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore, type PortalView } from "@/lib/portal-store";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProjectIcon } from "./IssueTypeIcon";

const NAV: { view: PortalView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "projects", label: "Projects", icon: Archive },
  { view: "team", label: "Team", icon: Users },
  { view: "settings", label: "Settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const org = usePortalStore((s) => s.org);
  const me = usePortalStore((s) => s.me);
  const role = usePortalStore((s) => s.role);
  const workspace = usePortalStore((s) => s.workspace);
  const view = usePortalStore((s) => s.view);
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  const setView = usePortalStore((s) => s.setView);
  const openProject = usePortalStore((s) => s.openProject);
  const resetSession = usePortalStore((s) => s.resetSession);

  const projects = workspace?.projects ?? [];
  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // cookie may already be gone — proceed
    }
    resetSession();
    toast.success("Logged out");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-stone-950 to-stone-900 text-stone-300">
      {/* Org header */}
      <div className="flex items-center gap-2.5 border-b border-stone-800/80 px-4 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-sm font-bold text-white">
          P
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-stone-100">{org?.name ?? "Workspace"}</div>
          {org && (
            <span className="mt-0.5 inline-flex items-center rounded bg-stone-800 px-1.5 py-px font-mono text-[10px] text-stone-400">
              {org.slug}
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex flex-col gap-0.5 px-2 pt-3">
        {NAV.map((item) => {
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => {
                setView(item.view);
                onNavigate?.();
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                active
                  ? "bg-amber-600/15 text-amber-400"
                  : "text-stone-400 hover:bg-stone-800/70 hover:text-stone-100"
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
              {item.view === "projects" && projects.length > 0 && (
                <span className="ml-auto rounded bg-stone-800 px-1.5 text-[10px] text-stone-400">
                  {projects.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Projects */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar]:w-1.5">
        <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Projects
        </div>
        {activeProjects.length === 0 && archivedProjects.length === 0 && (
          <p className="px-3 py-2 text-xs text-stone-500">No projects yet.</p>
        )}
        <div className="flex flex-col gap-0.5">
          {activeProjects.map((p) => {
            const active = view === "project" && activeProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  openProject(p.id);
                  onNavigate?.();
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                  active
                    ? "bg-amber-600/15 text-amber-400"
                    : "text-stone-400 hover:bg-stone-800/70 hover:text-stone-100"
                )}
              >
                <ProjectIcon icon={p.icon} color={p.color} size={11} className="!size-5 !w-5" />
                <span className="shrink-0 font-mono text-[11px] text-stone-500">{p.key}</span>
                <span className="truncate">{p.name}</span>
                <ChevronRight
                  className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
                  aria-hidden
                />
              </button>
            );
          })}
          {archivedProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                openProject(p.id);
                onNavigate?.();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-800/50 hover:text-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              <Archive className="size-3.5 shrink-0" aria-hidden />
              <span className="shrink-0 font-mono text-[11px]">{p.key}</span>
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide">archived</span>
            </button>
          ))}
        </div>
      </div>

      {/* User */}
      {me && (
        <div className="border-t border-stone-800/80 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open user menu"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-stone-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <Avatar name={me.name} color={me.avatarColor} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-200">{me.name}</span>
                  <span className="block truncate text-[11px] text-stone-500">
                    {role ?? "Member"}
                    {me.title ? ` · ${me.title}` : ""}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium text-stone-900">{me.name}</div>
                <div className="text-xs text-stone-500">{me.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => toast.info("Profile page coming soon")}>
                <UserCircle2 className="size-4" aria-hidden /> Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleLogout()} variant="destructive">
                <LogOut className="size-4" aria-hidden /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 md:flex" aria-label="Sidebar">
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar() {
  const open = usePortalStore((s) => s.mobileNavOpen);
  const setOpen = usePortalStore((s) => s.setMobileNavOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 !max-w-[80vw] border-0 p-0 [&>button]:text-stone-400">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function MobileNavButton() {
  const setOpen = usePortalStore((s) => s.setMobileNavOpen);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      aria-label="Open navigation menu"
      onClick={() => setOpen(true)}
    >
      <Menu className="size-5" aria-hidden />
    </Button>
  );
}
