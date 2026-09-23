"use client";

import { useState } from "react";
import { Archive, FolderKanban, Plus, Users } from "lucide-react";

import { usePortalStore } from "@/lib/portal-store";
import type { ProjectDTO } from "@/lib/portal-types";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { ProjectIcon } from "./IssueTypeIcon";
import { ProjectDialog } from "./ProjectDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function ProjectCard({ project }: { project: ProjectDTO }) {
  const openProject = usePortalStore((s) => s.openProject);
  return (
    <button
      type="button"
      onClick={() => openProject(project.id)}
      className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-lg"
      aria-label={`Open project ${project.name}`}
    >
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <ProjectIcon icon={project.icon} color={project.color} size={16} />
            <div className="flex items-center gap-1.5">
              {project.archived && (
                <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Archived
                </span>
              )}
              <span className="rounded bg-muted px-1.5 py-px font-mono text-[11px] font-semibold text-muted-foreground">
                {project.key}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-amber-700">
              {project.name}
            </h3>
            <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs leading-4 text-muted-foreground">
              {project.description || "No description"}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-border/70 pt-3">
            <div className="flex items-center gap-1.5">
              {project.lead ? (
                <>
                  <Avatar name={project.lead.name} color={project.lead.avatarColor} size="sm" />
                  <span className="max-w-24 truncate text-xs text-muted-foreground">{project.lead.name}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground/80">No lead</span>
              )}
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground/80">
              <FolderKanban className="size-3.5" aria-hidden />
              {project.issueCount} issue{project.issueCount === 1 ? "" : "s"}
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export function ProjectsView() {
  const workspace = usePortalStore((s) => s.workspace);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const projects = workspace?.projects ?? [];
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active.length} active project{active.length === 1 ? "" : "s"}
            {archived.length > 0 ? ` · ${archived.length} archived` : ""}
          </p>
        </div>
        <Button className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden /> New project
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          hint="Create your first project to start planning work with boards, backlogs and sprints."
          action={
            <Button className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden /> New project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section aria-label="Archived projects" className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-muted-foreground/80" aria-hidden />
              <Label className="text-sm text-muted-foreground">Show archived projects</Label>
            </div>
            <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Toggle archived projects" />
          </div>
          {showArchived && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-80">
              {archived.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground/80">
        <Users className="size-3.5" aria-hidden />
        Projects are visible to every member of your organization.
      </div>

      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
    </div>
  );
}
