"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  KanbanSquare,
  ListChecks,
  PieChart,
  Plus,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { ProjectTab } from "@/lib/portal-store";
import { useProjectDataContext, ProjectDataProvider } from "./project-data";
import { BoardView } from "./BoardView";
import { BacklogView } from "./BacklogView";
import { IssuesTableView } from "./IssuesTableView";
import { ReportsView } from "./ReportsView";
import { ProjectDialog } from "./ProjectDialog";
import { ProjectIcon } from "./IssueTypeIcon";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS: { value: ProjectTab; label: string; icon: typeof KanbanSquare }[] = [
  { value: "board", label: "Board", icon: KanbanSquare },
  { value: "backlog", label: "Backlog", icon: ListChecks },
  { value: "issues", label: "Issues", icon: ListChecks },
  { value: "reports", label: "Reports", icon: PieChart },
  { value: "settings", label: "Settings", icon: Settings2 },
];

function ProjectSettingsTab() {
  const { data } = useProjectData();
  const isAdmin = usePortalStore((s) => s.role === "ADMIN");
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const bumpProjectData = usePortalStore((s) => s.bumpProjectData);
  const setView = usePortalStore((s) => s.setView);
  const openProject = usePortalStore((s) => s.openProject);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const project = data.project;

  async function toggleArchived(archived: boolean) {
    setBusy(true);
    try {
      await api.patchProject(project.id, { archived });
      toast.success(archived ? "Project archived" : "Project restored");
      await refreshWorkspace();
      bumpProjectData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      toast.success(`Project ${project.key} deleted`);
      await refreshWorkspace();
      setView("projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <ProjectIcon icon={project.icon} color={project.color} size={18} />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {project.name}{" "}
                <span className="ml-1 rounded bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">
                  {project.key}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{project.description || "No description"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium text-foreground">Project lead</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {project.lead ? (
                  <>
                    <Avatar name={project.lead.name} color={project.lead.avatarColor} size="xs" />
                    {project.lead.name}
                  </>
                ) : (
                  "Unassigned"
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit project
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="archive-toggle" className="text-sm font-medium text-foreground">
                Archived
              </Label>
              <p className="text-xs text-muted-foreground">Archived projects are read-only and hidden from the main list.</p>
            </div>
            <Switch
              id="archive-toggle"
              checked={project.archived}
              disabled={busy}
              onCheckedChange={(v) => void toggleArchived(v)}
            />
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-rose-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-rose-700">
              <TriangleAlert className="size-4" aria-hidden /> Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-rose-500/30 p-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">Delete this project</div>
                <p className="text-xs text-muted-foreground">
                  Permanently removes {project.key}, all its issues, sprints and history. This cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1.5">
                    <Archive className="size-3.5" aria-hidden /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {project.key}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the project and all {data.stats.total} issues. Consider archiving it
                      instead if you may need the history later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        void deleteProject();
                      }}
                    >
                      Delete project
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}

      <ProjectDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" project={project} onSaved={() => {
        openProject(project.id, "settings");
      }} />
    </div>
  );
}

function ProjectViewInner() {
  const ctx = useProjectDataContext();
  const data = ctx?.data ?? null;
  const loading = ctx ? ctx.loading : true;
  const error = ctx?.error ?? null;
  const workspace = usePortalStore((s) => s.workspace);
  const activeProjectId = usePortalStore((s) => s.activeProjectId)!;
  const projectTab = usePortalStore((s) => s.projectTab);
  const setProjectTab = usePortalStore((s) => s.setProjectTab);
  const openCreateIssue = usePortalStore((s) => s.openCreateIssue);
  const openProject = usePortalStore((s) => s.openProject);

  // Fall back to workspace copy while detail loads (keeps header responsive).
  const wsProject = workspace?.projects.find((p) => p.id === activeProjectId);
  const project = data?.project ?? wsProject ?? null;

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load this project</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-4 pb-0 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 pb-3">
          {project ? (
            <>
              <ProjectIcon icon={project.icon} color={project.color} size={18} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{project.name}</h1>
                  <span className="hidden rounded bg-muted px-1.5 py-px font-mono text-[11px] font-semibold text-muted-foreground sm:inline">
                    {project.key}
                  </span>
                  {project.archived && (
                    <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ArchiveRestore className="size-3" aria-hidden /> Archived
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {project.lead && (
                    <>
                      <Avatar name={project.lead.name} color={project.lead.avatarColor} size="xs" />
                      Led by {project.lead.name}
                    </>
                  )}
                  {data && (
                    <span className="hidden sm:inline">
                      · {data.stats.total} issues · {data.stats.done} done
                      {data.stats.overdue > 0 ? ` · ${data.stats.overdue} overdue` : ""}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="ml-auto gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => openCreateIssue({ kind: "project", projectId: activeProjectId })}
                disabled={project.archived}
              >
                <Plus className="size-4" aria-hidden /> New issue
              </Button>
            </>
          ) : (
            <>
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="h-6 w-48" />
            </>
          )}
        </div>

        <Tabs value={projectTab} onValueChange={(v) => setProjectTab(v as ProjectTab)}>
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-transparent bg-transparent p-0 sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-1.5 rounded-b-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-amber-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <t.icon className="size-3.5" aria-hidden /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? (
          <div className="space-y-4 p-4 sm:p-6">
            <Skeleton className="h-10 w-full max-w-md" />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-lg" />
              ))}
            </div>
          </div>
        ) : data ? (
          <Tabs value={projectTab} onValueChange={(v) => setProjectTab(v as ProjectTab)}>
            <TabsContent value="board" className="mt-0">
              <BoardView />
            </TabsContent>
            <TabsContent value="backlog" className="mt-0">
              <BacklogView />
            </TabsContent>
            <TabsContent value="issues" className="mt-0">
              <IssuesTableView />
            </TabsContent>
            <TabsContent value="reports" className="mt-0">
              <ReportsView />
            </TabsContent>
            <TabsContent value="settings" className="mt-0">
              <ProjectSettingsTab />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectView() {
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  if (!activeProjectId) return null;
  return (
    <ProjectDataProvider projectId={activeProjectId}>
      <ProjectViewInner />
    </ProjectDataProvider>
  );
}
