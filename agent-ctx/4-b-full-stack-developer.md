# Task 4-b — full-stack-developer (frontend) — Work Record

Task ID: 4-b
Date: build session, portal SPA UI for ProjectOS

## What was built

The complete ProjectOS portal SPA mounted at the single route `/`
(`src/app/page.tsx` → `<PortalApp />`). Everything is client-side with
zustand-driven view switching. No new routes created; layout.tsx only had its
metadata changed (title/description → "ProjectOS — Project Management Portal").

### Files created

Library:
- `src/lib/portal-types.ts` — strict TS DTOs mirroring the API contract (UserDTO, OrgDTO, ProjectDTO, TypeDTO, StatusDTO, PriorityDTO, LabelDTO, SprintDTO, CommentDTO, ActivityDTO, NotificationDTO, IssueDTO, WorkspacePayload, MePayload, ProjectDetailPayload, IssueDetailPayload, DashboardPayload, NotificationsPayload, SearchPayload, BurndownPayload, VelocityPayload, OverviewPayload, plus request-body types).
- `src/lib/api-client.ts` — `apiFetch<T>()` (relative paths, same-origin credentials, JSON; throws `Error(message from {error})` on !ok; `ApiError` subclass carries `.status`) + namespaced `api.*` endpoint functions for auth, workspace, projects, issues, comments, sprints, dashboard, notifications, search, reports, members.
- `src/lib/portal-store.ts` — zustand store (shape below) + `useIsAdmin` / `useCanManage` helpers.

Components (`src/components/portal/`):
- `PortalApp.tsx` — root: GET /api/auth/me equivalent via `api.workspace()` bootstrap; anon → `AuthView`, authed → app shell (dark Sidebar + TopBar + scrollable main with AnimatePresence view fade + global overlays: IssuePanel Sheet, CreateIssueDialog, GlobalCreateProjectDialog, SearchPalette, sonner Toaster). Handles `/?issue=KEY` deep link. Splash screen while loading.
- `AuthView.tsx` — split screen: dark brand panel (amber "P" mark, feature list) + Login/Signup tabs (signup auto-suggests org slug from org name; slug field editable). Prominent "Try demo account" button (sarah@acme.dev / demo1234). sonner error toasts, spinner on buttons.
- `Sidebar.tsx` — dark stone-950→900 gradient; org name + slug chip; nav (Dashboard/Projects/Team/Settings) with amber active state; project list (colored icon, key, name; archived section); user menu dropdown (Profile stub, Log out). Mobile: same content in a left Sheet drawer (`MobileSidebar` + `MobileNavButton`).
- `TopBar.tsx` — breadcrumbs for project view (Projects / KEY Name), search button with ⌘K hint, notifications bell (30s polling, unread badge, mark-all-read, click → open issue), Create dropdown (New issue with project preselect / New project), user avatar menu.
- `DashboardView.tsx` — greeting + date, 4 StatCards (my open, open, completed this week, active sprints), My Issues list (max-h scroll), Active sprint cards with Progress bars, Created-vs-Resolved recharts AreaChart (amber/emerald gradients), Upcoming due, Recent activity feed with type icons and "field: old → new" rendering.
- `ProjectsView.tsx` — project card grid (icon, key chip, description, lead avatar, issue count, archived badge), archived toggle (Switch), empty state, create dialog.
- `ProjectDialog.tsx` — create/edit project dialog (name, key auto-suggest uppercase ≤5, description, 8 color swatches, 13-icon lucide picker, lead select) + `GlobalCreateProjectDialog` wired to store.
- `ProjectView.tsx` — project header (icon, key chip, lead, stats, New issue) + Tabs Board|Backlog|Issues|Reports|Settings (amber underline active tab) + project Settings tab (edit dialog, archive switch, ADMIN-only danger-zone delete with AlertDialog).
- `project-data.tsx` — ProjectDataProvider context: fetches GET /api/projects/[id], exposes data/loading/error/refetch + optimistic mutators (applyIssue, addIssue, removeIssue, applySprint, removeSprint). Refetches when store's `projectDataVersion` bumps (e.g. issue patched in the panel).
- `BoardView.tsx` — dnd-kit kanban: one column per org status (ordered), droppable columns + droppable cards (insert-before via midpoint float ordering), DragOverlay with tilted card, optimistic `patchIssue({statusId, order})` + toast/refetch on error, filter bar (text, assignee, type, priority, only-mine switch, clear), per-column "+" new issue. Columns scroll horizontally on mobile; card lists scroll vertically (thin scrollbar).
- `BacklogView.tsx` — ACTIVE/FUTURE sprint sections + Backlog section, all droppable; drag issues between sections → optimistic `patchIssue({sprintId})` (blocked into COMPLETED sprints); collapsible sections with count badges; sprint header shows dates/goal/points/counts + actions menu (Start sprint with date dialog, Complete sprint confirm showing unfinished count, Edit, Delete); completed sprints read-only strip; inline new-issue row (type select + summary + Enter). Guarded sprint-start 409 errors surfaced as toasts.
- `IssuesTableView.tsx` — full table (Key, Summary, Type, Status select inline→workflow patch, Priority, Assignee avatar, Sprint, Pts, Due, Updated), sortable by key/due/updated, same filter bar, row click opens panel, client-side CSV export.
- `ReportsView.tsx` — Burndown LineChart (remaining vs ideal, sprint select defaulting to ACTIVE), Velocity BarChart (committed vs completed), Status & Type PieCharts (colored by data color), Priority horizontal BarChart, Team workload horizontal grouped bars (open vs done per member), project snapshot strip. Palette amber/emerald/violet/rose/orange/stone only.
- `IssuePanel.tsx` — right Sheet (560px): key chip + project name, inline type select, copy link, editable summary (click-to-edit), markdown description (react-markdown) with edit/save, properties grid (Status via workflow, Assignee, Priority, Sprint, Story points, Due date popover calendar + clear, Estimate/Remaining hours — all committed onBlur with optimistic patch), labels multi-toggle, subtasks list (click-through) + inline add-subtask, comments (avatar list, relative time, delete own/ADMIN, add box with @mention hint), activity timeline, footer delete (ADMIN/MANAGER) with AlertDialog. Every patch updates local detail + bumps `projectDataVersion` so open project views refetch.
- `CreateIssueDialog.tsx` — global dialog (project select with archived disabled / fixed project, type select with icons, summary, description, priority, assignee, story points, due calendar, label toggles) → create → toast + refreshWorkspace + bumpProjectData + opens the issue panel.
- `TeamView.tsx` — members table (avatar, name/you chip, email, title, role badge), invite dialog (email/name/title/role; ADMIN/MANAGER only), role change dropdown per row (ADMIN only, self protected).
- `SettingsView.tsx` — org card (name, slug chip with copy button, project/member counts, own role badge) + project settings section (project picker, edit via ProjectDialog, archive switch, ADMIN-only delete) reusing shared dialogs.
- `SearchPalette.tsx` — cmdk CommandDialog bound to ⌘K/Ctrl+K; parses `KEY-n` (jump-to group), `assignee:me` (client filter, token stripped from query); debounced 250ms `/api/search`; grouped Issues/Projects results; Enter opens issue panel or project board.
- Small shared: `Avatar.tsx` (+AvatarStack), `IssueTypeIcon.tsx` (icon-name registry + `ProjectIcon` + PROJECT_ICON_CHOICES), `PriorityIcon.tsx`, `StatusBadge.tsx` (+StatusDot), `KeyBadge.tsx`, `EmptyState.tsx`, `StatCard.tsx`, `RelativeTime.tsx` (+formatDate/formatDateShort/isOverdue), `IssueCard.tsx` (shared board/backlog card body), `issue-filters.tsx` (IssueFilters type, matchesFilters, useIssueFilters, FilterBar).

Also updated:
- `src/app/page.tsx` → renders `<PortalApp />` (scaffold content removed).
- `src/app/layout.tsx` → metadata title/description only; fonts and existing Toaster untouched.

## Zustand store shape (`src/lib/portal-store.ts`)

```
{
  // session
  me: UserDTO | null, org: OrgDTO | null, role: string | null,
  workspace: WorkspacePayload | null, workspaceLoading: boolean,
  setSession({user,org,role}), setWorkspace(ws), refreshWorkspace(): Promise, resetSession(),

  // navigation
  view: 'dashboard'|'projects'|'project'|'team'|'settings',
  activeProjectId: string | null,
  projectTab: 'board'|'backlog'|'issues'|'reports'|'settings',
  openIssueId: string | null,
  projectDataVersion: number,          // bumped → ProjectDataProvider refetches
  setView(v), openProject(id, tab='board'), setProjectTab(t), setOpenIssue(id|null), bumpProjectData(),

  // dialogs
  createIssue: {kind:'global'} | {kind:'project', projectId} | null,
  openCreateIssue(ctx?), closeCreateIssue(),
  createProjectOpen: boolean, setCreateProjectOpen(b),
  searchOpen: boolean, setSearchOpen(b),
  mobileNavOpen: boolean, setMobileNavOpen(b),

  // notifications
  notifications: NotificationDTO[], unread: number,
  setNotifications(list, unread), refreshNotifications(): Promise,
  markAllRead(): Promise, markRead(ids): Promise,
}
```

## Backend assumptions / integration notes

- Backend follows the worklog contract exactly — verified end-to-end against the
  live API (signup → workspace → project → issues → sprint start → status via
  workflow → comments → dashboard → notifications → search → burndown →
  velocity → overview → members invite/role-change → mark-read → delete project).
  All returned 200 with contract-shaped DTOs.
- `GET /api/auth/me` is not called directly; bootstrap uses `GET /api/workspace`
  (superset of me: user+org+role). 401 → AuthView.
- Sprint list for the IssuePanel sprint select comes from
  `GET /api/projects/{issue.projectId}` (best-effort, non-fatal).
- Ordering uses float `order` with midpoint insertion — no bulk reorder endpoint assumed.
- Demo accounts require `prisma/seed.ts` (Task 4-a scope) to have been run;
  until then the demo button shows a graceful error toast.
- Optimistic updates always reconcile from the server response and roll back via
  refetch + toast on error.

## Quality

- `bun run lint` → 0 errors, 0 warnings (fixed: missing DragOverlay import,
  lucide `Infinite` export typo, react-hooks static-component + setState-in-effect
  rule violations).
- Dev server compiles clean (`✓ Compiled`), `GET /` → 200.
- No blue/indigo Tailwind classes anywhere; palette = zinc/stone + amber-600 accent,
  emerald/violet/rose/orange semantics per design language.
