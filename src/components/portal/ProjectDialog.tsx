"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { ProjectDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { PROJECT_ICON_CHOICES, ProjectIcon, resolveIcon } from "./IssueTypeIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const COLOR_CHOICES = [
  "#d97706",
  "#059669",
  "#7c3aed",
  "#e11d48",
  "#ea580c",
  "#0d9488",
  "#65a30d",
  "#57534e",
];

function suggestKey(name: string): string {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 5);
}

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  project?: ProjectDTO | null;
  onSaved?: (p: ProjectDTO) => void;
}) {
  const workspace = usePortalStore((s) => s.workspace);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const bumpProjectData = usePortalStore((s) => s.bumpProjectData);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [icon, setIcon] = useState<string>("rocket");
  const [leadId, setLeadId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const members = useMemo(() => workspace?.members ?? [], [workspace]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && project) {
      setName(project.name);
      setKey(project.key);
      setKeyTouched(true);
      setDescription(project.description ?? "");
      setColor(project.color);
      setIcon(project.icon);
      setLeadId(project.lead?.id ?? "none");
    } else {
      setName("");
      setKey("");
      setKeyTouched(false);
      setDescription("");
      setColor(COLOR_CHOICES[0]);
      setIcon("rocket");
      setLeadId("none");
    }
  }, [open, mode, project]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      toast.error("Project name and key are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim() || undefined,
        color,
        icon,
        leadId: leadId === "none" ? undefined : leadId,
      };
      const saved =
        mode === "create"
          ? await api.createProject(body)
          : await api.patchProject(project!.id, body);
      toast.success(mode === "create" ? `Project ${saved.key} created` : "Project updated");
      await refreshWorkspace();
      bumpProjectData();
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4 text-amber-600" aria-hidden />
            {mode === "create" ? "Create project" : `Edit ${project?.name ?? "project"}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Projects group issues, sprints and reports. Issue keys are prefixed with the project key."
              : "Update the project details shown across the portal."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                required
                placeholder="Website Redesign"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!keyTouched) setKey(suggestKey(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-key">Key</Label>
              <Input
                id="proj-key"
                required
                maxLength={5}
                className="font-mono uppercase"
                placeholder="WEB"
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5));
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              rows={2}
              placeholder="What is this project about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project color">
                {COLOR_CHOICES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Color ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-7 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110 focus-visible:outline-none",
                      color === c ? "ring-stone-800" : "ring-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project icon">
                {PROJECT_ICON_CHOICES.map((ic) => {
                  const Icon = resolveIcon(ic);
                  return (
                    <button
                      key={ic}
                      type="button"
                      role="radio"
                      aria-checked={icon === ic}
                      aria-label={`Icon ${ic}`}
                      onClick={() => setIcon(ic)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md border transition-colors",
                        icon === ic
                          ? "border-amber-600 bg-amber-500/10 text-amber-700"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Project lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger aria-label="Project lead">
                <SelectValue placeholder="Select lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.role.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {mode === "create" ? "Create project" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Global "New project" dialog controlled by the store (TopBar ⌵ Create). */
export function GlobalCreateProjectDialog() {
  const open = usePortalStore((s) => s.createProjectOpen);
  const setOpen = usePortalStore((s) => s.setCreateProjectOpen);
  const openProject = usePortalStore((s) => s.openProject);
  return (
    <ProjectDialog
      open={open}
      onOpenChange={setOpen}
      mode="create"
      onSaved={(p) => openProject(p.id)}
    />
  );
}
