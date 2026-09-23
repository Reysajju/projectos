"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Copy, FolderKanban, ListPlus, Loader2, Pencil, Plus, Settings2, Trash2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { CustomFieldDTO, CustomFieldType } from "@/lib/portal-types";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

      {/* Custom fields */}
      <CustomFieldsManager canManage={role === "ADMIN" || role === "MANAGER"} fields={workspace.customFields} />

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

// ─── Custom fields manager ──────────────────────────────────────

const FIELD_TYPES: { value: CustomFieldType; label: string; hint: string }[] = [
  { value: "TEXT", label: "Text", hint: "Free-form single line" },
  { value: "NUMBER", label: "Number", hint: "Numeric value" },
  { value: "DATE", label: "Date", hint: "Calendar date picker" },
  { value: "SELECT", label: "Select", hint: "Choose from fixed options" },
  { value: "CHECKBOX", label: "Checkbox", hint: "Yes / no toggle" },
];

function CustomFieldsManager({
  canManage,
  fields,
}: {
  canManage: boolean;
  fields: CustomFieldDTO[];
}) {
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function createField(body: { name: string; type: CustomFieldType; options: string[] }) {
    try {
      await api.createCustomField(body);
      await refreshWorkspace();
      toast.success(`Field “${body.name}” created`);
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create field");
    }
  }

  async function renameField(id: string, name: string) {
    setBusyId(id);
    try {
      await api.patchCustomField(id, { name });
      await refreshWorkspace();
      toast.success("Field renamed");
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename field");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteField(id: string) {
    setBusyId(id);
    try {
      await api.deleteCustomField(id);
      await refreshWorkspace();
      toast.success("Field deleted — issue values are kept but hidden");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete field");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListPlus className="size-4 text-amber-600" aria-hidden /> Custom fields
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Organization-wide issue fields — they appear in the issue panel and the issues table.
          {canManage ? "" : " Only admins and managers can change them."}
        </p>

        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground/80">
            No custom fields yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/40"
              >
                {editingId === f.id ? (
                  <>
                    <Input
                      className="h-8 flex-1"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editName.trim()) void renameField(f.id, editName.trim());
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Field name"
                    />
                    <Button
                      size="sm"
                      className="h-8 bg-amber-600 hover:bg-amber-700"
                      disabled={busyId === f.id || !editName.trim()}
                      onClick={() => void renameField(f.id, editName.trim())}
                    >
                      {busyId === f.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{f.name}</span>
                    <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {f.type}
                    </span>
                    {f.type === "SELECT" && (
                      <span className="hidden max-w-40 truncate text-[11px] text-muted-foreground/80 sm:inline">
                        {f.options.join(" · ")}
                      </span>
                    )}
                    {canManage && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Rename ${f.name}`}
                          className="rounded p-1.5 text-muted-foreground/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                          onClick={() => {
                            setEditingId(f.id);
                            setEditName(f.name);
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${f.name}`}
                          className="rounded p-1.5 text-muted-foreground/80 hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                          onClick={() => setConfirmDeleteId(f.id)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> New field
          </Button>
        )}

        <CreateFieldDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createField} />

        <Dialog open={confirmDeleteId != null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete “{fields.find((f) => f.id === confirmDeleteId)?.name}”?</DialogTitle>
              <DialogDescription>
                The field disappears from the issue panel and table. Existing values are kept in storage but no longer shown.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={busyId != null}
                onClick={() => confirmDeleteId && void deleteField(confirmDeleteId)}
              >
                {busyId === confirmDeleteId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Delete field
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CreateFieldDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (body: { name: string; type: CustomFieldType; options: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setType("TEXT");
    setOptionsRaw("");
  }

  async function submit() {
    const options = optionsRaw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    setBusy(true);
    await onCreate({ name: name.trim(), type, options });
    setBusy(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New custom field</DialogTitle>
          <DialogDescription>Applies to every issue in this organization.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={name}
              autoFocus
              placeholder="e.g. Environment, Release build"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !(type === "SELECT" && !optionsRaw.trim())) void submit();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
              <SelectTrigger id="cf-type" aria-label="Field type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      {t.label}
                      <span className="text-[11px] text-muted-foreground/80">— {t.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "SELECT" && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-options">Options</Label>
              <Input
                id="cf-options"
                value={optionsRaw}
                placeholder="Comma separated — e.g. Production, Staging, Dev"
                onChange={(e) => setOptionsRaw(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700"
            disabled={busy || !name.trim() || (type === "SELECT" && !optionsRaw.trim())}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Create field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
