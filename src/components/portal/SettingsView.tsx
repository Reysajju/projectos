"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Copy, FolderKanban, Settings2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import { Avatar } from "./Avatar";
import { ProjectDialog } from "./ProjectDialog";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function SettingsView() {
  const workspace = usePortalStore((s) => s.workspace);
  const role = usePortalStore((s) => s.role);
  const activeProjectId = usePortalStore((s) => s.activeProjectId);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const bumpProjectData = usePortalStore((s) => s.bumpProjectData);
  const setView = usePortalStore((s) => s.setView);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProjectId ?? "");
  const [busy, setBusy] = useState(false);

  const projects = useMemo(() => workspace?.projects ?? [], [workspace]);
  const project = projects.find((p) => p.id === selectedProjectId) ?? null;
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(activeProjectId ?? projects.find((p) => !p.archived)?.id ?? "");
    }
  }, [projects, selectedProjectId, activeProjectId]);

  function copySlug() {
    if (!workspace) return;
    void navigator.clipboard
      .writeText(workspace.org.slug)
      .then(() => {
        setCopied(true);
        toast.success("Slug copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy slug"));
  }

  async function toggleArchived(archived: boolean) {
    if (!project) return;
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
    if (!project) return;
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      toast.success(`Project ${project.key} deleted`);
      setSelectedProjectId("");
      await refreshWorkspace();
      setView("projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) return null;
  const org = workspace.org;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organization and project configuration.</p>
      </div>

      {/* Org card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-amber-600" aria-hidden /> Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-amber-600 text-lg font-bold text-white">
                {org.name[0]?.toUpperCase() ?? "O"}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{org.name}</div>
                <button
                  type="button"
                  onClick={copySlug}
                  aria-label="Copy organization slug"
                  className="mt-0.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                >
                  /org/{org.slug}
                  {copied ? <Check className="size-3 text-emerald-600" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <FolderKanban className="size-3.5" aria-hidden />
                {projects.length} projects
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden />
                {workspace.members.length} members
              </span>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Your role</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              {workspace.role}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Project settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-amber-600" aria-hidden /> Project settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={selectedProjectId || undefined}
              onValueChange={setSelectedProjectId}
            >
              <SelectTrigger aria-label="Select project">
                <SelectValue placeholder={projects.length ? "Select a project" : "No projects yet"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.key} · {p.name}
                    {p.archived ? " (archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {project ? (
            <>
              <div className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: project.color }}
                      aria-hidden
                    >
                      <FolderKanban className="size-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {project.name}
                        <span className="ml-2 rounded bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">
                          {project.key}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{project.description || "No description"}</p>
                      {project.lead && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Avatar name={project.lead.name} color={project.lead.avatarColor} size="xs" />
                          Lead: {project.lead.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-foreground">Archived</Label>
                  <p className="text-xs text-muted-foreground">Archived projects are hidden from the projects list and read-only.</p>
                </div>
                <Switch
                  checked={project.archived}
                  disabled={busy}
                  onCheckedChange={(v) => void toggleArchived(v)}
                  aria-label="Toggle archived"
                />
              </div>

              {isAdmin && (
                <div className="rounded-lg border border-rose-500/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">Delete project</div>
                        <p className="text-xs text-muted-foreground">Permanently removes {project.key} and all of its issues.</p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={busy}>
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {project.key}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes the project, its {project.issueCount} issues, sprints and history.
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-rose-600 text-white hover:bg-rose-700"
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
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground/80">
              {projects.length ? "Select a project above to configure it." : "Create a project first."}
            </p>
          )}
        </CardContent>
      </Card>

      {project && (
        <ProjectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          project={project}
        />
      )}
    </div>
  );
}
