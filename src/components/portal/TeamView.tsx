"use client";

import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { MemberWithRoleDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLES = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const;

function roleBadgeClass(role: string): string {
  switch (role) {
    case "ADMIN":
      return "bg-amber-100 text-amber-800";
    case "MANAGER":
      return "bg-violet-100 text-violet-700";
    case "VIEWER":
      return "bg-stone-100 text-stone-500";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<string>("MEMBER");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const member = await api.inviteMember({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        title: title.trim() || undefined,
      });
      toast.success(`${member.name || member.email} added to the workspace`);
      await refreshWorkspace();
      setEmail("");
      setName("");
      setTitle("");
      setRole("MEMBER");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-amber-600" aria-hidden /> Add team member
          </DialogTitle>
          <DialogDescription>
            New members get access to all projects in this organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-title">Title</Label>
              <Input id="invite-title" placeholder="e.g. Designer" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
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
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamView() {
  const workspace = usePortalStore((s) => s.workspace);
  const role = usePortalStore((s) => s.role);
  const me = usePortalStore((s) => s.me);
  const refreshWorkspace = usePortalStore((s) => s.refreshWorkspace);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const members = useMemo(() => workspace?.members ?? [], [workspace]);
  const isAdmin = role === "ADMIN";
  const canInvite = role === "ADMIN" || role === "MANAGER";

  async function changeRole(member: MemberWithRoleDTO, newRole: string) {
    setChangingRole(member.id);
    try {
      await api.patchMember(member.id, { role: newRole });
      toast.success(`${member.name} is now ${newRole}`);
      await refreshWorkspace();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Team</h1>
          <p className="mt-1 text-sm text-stone-500">
            {members.length} member{members.length === 1 ? "" : "s"} in {workspace?.org.name ?? "your workspace"}
          </p>
        </div>
        {canInvite && (
          <Button className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" aria-hidden /> Add member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members" hint="Invite teammates to collaborate on projects." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <Table>
            <TableHeader className="bg-stone-50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Title</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className={cn(changingRole === m.id && "opacity-60")}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} color={m.avatarColor} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                          {m.name}
                          {me?.id === m.id && (
                            <span className="rounded bg-stone-100 px-1 py-px text-[10px] font-semibold text-stone-500">you</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400 sm:hidden">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-xs text-stone-500">{m.email}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs text-stone-500">{m.title ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    {isAdmin && me?.id !== m.id ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Change role for ${m.name}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                              roleBadgeClass(m.role)
                            )}
                          >
                            <ShieldCheck className="size-3" aria-hidden />
                            {m.role}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                          <DropdownMenuLabel className="text-xs text-stone-500">Change role</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {ROLES.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              disabled={r === m.role}
                              onSelect={() => void changeRole(m, r)}
                            >
                              {r}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          roleBadgeClass(m.role)
                        )}
                      >
                        <ShieldCheck className="size-3" aria-hidden />
                        {m.role}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-stone-400">
        {isAdmin
          ? "You can change member roles. ADMIN manages everything, MANAGER manages projects, MEMBER works on issues, VIEWER has read-only access."
          : "Roles are managed by workspace admins."}
      </p>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
