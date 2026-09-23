# ProjectOS — Worklog (Single Source of Truth)

Product: **ProjectOS** — Jira-class multi-tenant project management portal built from the uploaded blueprint (orgs → projects → issues, workflow engine, sprints, kanban board, backlog, reports, notifications, audit log).

## Architecture decisions (locked)

- **Stack**: Next.js 16 App Router + TypeScript, Prisma + SQLite (`db/custom.db`), shadcn/ui (New York), dnd-kit, recharts, zustand, date-fns, lucide-react.
- **Single visible route `/`** — the whole portal is one SPA in `src/app/page.tsx` → `<PortalApp />` with client-side view switching (zustand). NO other pages. Backend = Next.js route handlers under `src/app/api/**` (NOT server actions).
- **Auth**: custom session tokens (httpOnly cookie `pos_session`, 30 days). Password hashing: node:crypto `scrypt` (`src/lib/auth.ts` — `hashPassword`, `verifyPassword`). Helper `getSessionUser(req)` returns `{user, org, role}` or null. Route handlers read cookies via `req.cookies.get('pos_session')`.
- **DB client**: `import { db } from '@/lib/db'`.
- **Workflow engine**: statuses are DB rows per org (category TODO | IN_PROGRESS | DONE). ALL status changes go through `transitionIssue()` in `src/lib/workflow.ts` (validates status exists in org, writes Activity, fires Notifications). No direct `statusId` writes elsewhere.
- **Automation rules (v1)**: on issue.assigned → notify assignee; on issue.status_changed → notify reporter + assignee (excluding actor); on comment.created → notify assignee/reporter + @mentions parsed from body (`@Full Name`).
- **Design language**: light UI on white background, zinc/stone neutrals, **amber-600 (#d97706) accent**. FORBIDDEN: blue-*, indigo-* Tailwind classes. Semantic: emerald=done/success, rose=bug/highest/critical, amber=in-progress, violet=epic, orange=high. Sidebar dark (stone-950/900), content light. Rounded-lg cards, consistent p-4/gap-4. Sticky footer n/a (app shell uses full-height flex). Every list area: `max-h-… overflow-y-auto` + thin custom scrollbar.
- All dates serialized as ISO strings. All JSON responses `NextResponse.json`. All API errors: `{ error: string }` with proper status (400/401/403/404).

## Prisma schema (pushed, db/custom.db fresh)

Models: User, Session, Organization, OrganizationMember (role ADMIN|MANAGER|MEMBER|VIEWER), Project (unique orgId+key), IssueType, Status, Priority, Label, IssueLabel, Sprint (FUTURE|ACTIVE|COMPLETED), Issue (unique projectId+number, denormalized `key` like WEB-1, self-relation Subtasks), Comment, Activity (append-only), Notification.

## Demo accounts (seed script `prisma/seed.ts`, run `bun prisma/seed.ts`)

Org: **Acme Corp** (slug `acme`). Password for all: `demo1234`
- sarah@acme.dev — Sarah Chen — ADMIN — Product Lead
- marcus@acme.dev — Marcus Webb — MANAGER — Backend Lead
- aisha@acme.dev — Aisha Patel — MEMBER — Frontend Engineer
- tom@acme.dev — Tom Okafor — MEMBER — QA Engineer
- lena@acme.dev — Lena Brandt — MEMBER — Designer

Projects: WEB (Website Redesign, #d97706, Rocket), APP (Mobile Application, #059669, Smartphone), AI (AI Platform, #7c3aed, BrainCircuit).

## API CONTRACT (both agents MUST follow exactly)

Shared DTO shapes:

```ts
// Minimal user DTO used everywhere as "assignee"/"author"/"lead"/"user"
UserDTO      = { id, name, email, avatarColor, title: string|null }
OrgDTO       = { id, name, slug }
ProjectDTO   = { id, key, name, description, color, icon, lead: UserDTO|null, archived: boolean, issueCount: number }
TypeDTO      = { id, name, color, icon, order }
StatusDTO    = { id, name, category: 'TODO'|'IN_PROGRESS'|'DONE', color, order }
PriorityDTO  = { id, name, color, order }
LabelDTO     = { id, name, color }
SprintDTO    = { id, projectId, name, goal, startDate: string|null, endDate: string|null, status, order }
CommentDTO   = { id, body, createdAt, author: UserDTO }
ActivityDTO  = { id, type, field, oldValue, newValue, createdAt, user: UserDTO, issueId: string|null }
NotificationDTO = { id, type, title, body, issueId, read, createdAt }
IssueDTO = {
  id, key, number, summary, description,
  typeId, type: TypeDTO,
  statusId, status: StatusDTO,
  priorityId, priority: PriorityDTO|null,
  assigneeId, assignee: UserDTO|null,
  reporterId, reporter: UserDTO|null,
  labels: LabelDTO[],
  storyPoints: number|null, dueDate: string|null,
  estimateHours: number|null, remainingHours: number|null,
  sprintId: string|null, parentId: string|null, order: number,
  projectId, projectKey, projectName,
  createdAt, updatedAt,
  commentCount: number, subtaskCount: number, subtasksDone: number
}
```

### Endpoints (all under /api, all return DTOs above)

- `POST /api/auth/signup` body `{email,name,password,orgName,orgSlug}` → `{user:UserDTO, org:OrgDTO}` (creates org + ADMIN membership + default issueTypes/statuses/priorities/labels; slug unique-ified; auto-login)
- `POST /api/auth/login` `{email,password}` → `{user, org}`
- `POST /api/auth/logout` → `{}`
- `GET  /api/auth/me` → 401 or `{user, org, role}` (role = membership role)
- `GET  /api/workspace` → `{ user, org, role, members: (UserDTO&{role})[], projects: ProjectDTO[], issueTypes: TypeDTO[], statuses: StatusDTO[], priorities: PriorityDTO[], labels: LabelDTO[] }` — members exclude nothing (all org members)
- `POST /api/projects` `{name,key,description?,color?,icon?,leadId?}` → ProjectDTO (activity project.created)
- `PATCH /api/projects/[projectId]` `{name?,description?,color?,icon?,leadId?,archived?:boolean}` → ProjectDTO
- `DELETE /api/projects/[projectId]` → `{}` (403 unless ADMIN)
- `GET /api/projects/[projectId]` → `{ project: ProjectDTO, issues: IssueDTO[], sprints: SprintDTO[], activity: ActivityDTO[], stats: { total, todo, inProgress, done, points, donePoints, overdue } }`
- `POST /api/issues` `{projectId, typeId, summary, description?, priorityId?, assigneeId?, sprintId?, storyPoints?, dueDate?, parentId?, labelIds?: string[]}` → IssueDTO (number auto-increment per project, key = `${projectKey}-${number}`, activity issue.created, notify assignee)
- `GET /api/issues/[issueId]` → `{ issue: IssueDTO, comments: CommentDTO[], activity: ActivityDTO[], subtasks: IssueDTO[] }`
- `PATCH /api/issues/[issueId]` — any of `{summary?, description?, typeId?, statusId?, priorityId?, assigneeId?, sprintId?: string|null, storyPoints?: number|null, dueDate?: string|null, estimateHours?, remainingHours?, labelIds?: string[], order?: number}` → IssueDTO. Status changes MUST route through workflow transition (activity issue.status_changed + notify). assignment change → activity issue.assigned + notify. Writes activity rows for each changed field (issue.updated).
- `DELETE /api/issues/[issueId]` → `{}`
- `POST /api/issues/[issueId]/comments` `{body}` → CommentDTO (activity comment.created, notify assignee/reporter/@mentions)
- `DELETE /api/comments/[commentId]` → `{}`
- `POST /api/sprints` `{projectId, name, goal?, startDate?, endDate?}` → SprintDTO
- `PATCH /api/sprints/[sprintId]` `{name?, goal?, startDate?, endDate?, status?}` → SprintDTO. Transition rules: →ACTIVE only if no other ACTIVE sprint in project (move it after current active? no—409 error string); →COMPLETED moves its unfinished (status.category != DONE) issues back to backlog (sprintId=null) and keeps finished ones; activity sprint.started / sprint.completed + notify members.
- `DELETE /api/sprints/[sprintId]` → `{}` (issues → backlog)
- `GET /api/dashboard` → `{ stats: { myOpen, totalIssues, openIssues, completedThisWeek, activeSprints }, myIssues: IssueDTO[] (assignee=me, status!=DONE, max 8), upcomingDue: IssueDTO[] (assignee=me, dueDate set, not done, max 5), activity: ActivityDTO[] (max 12), createdVsResolved: [{date:'MM-DD', created, resolved}] (last 14 days), activeSprintCards: [{sprint: SprintDTO, projectName, projectKey, total, done, points, donePoints}] }`
- `GET /api/notifications` → `{ notifications: NotificationDTO[], unread: number }`
- `POST /api/notifications/read` `{ids?: string[]}` (empty ids = mark all) → `{}`
- `GET /api/search?q=...` → `{ issues: IssueDTO[] (max 12), projects: ProjectDTO[] (max 5) }` (match key/summary/description, org-scoped)
- `GET /api/reports/burndown?sprintId=` → `{ total, completed, points: [{date:'MM-DD', remaining, ideal}] }`
- `GET /api/reports/velocity?projectId=` → `{ sprints: [{id, name, committed, completed}] }` (COMPLETED + ACTIVE sprints, order asc, max 8)
- `GET /api/reports/overview?projectId=` → `{ statusDist: [{name, color, count}], priorityDist: [{name, color, count}], assigneeLoad: [{userId, name, avatarColor, open, done}], typeDist: [{name, color, count}] }`
- `POST /api/members` `{email, name?, role?, title?}` → member UserDTO&{role} (invite: find-or-create user w/ random password; activity member.joined; 403 unless ADMIN/MANAGER)
- `PATCH /api/members/[userId]` `{role}` → updated member (ADMIN only)

### Auth/session implementation (Task 3 — already written by coordinator)

`src/lib/auth.ts` exports:
- `hashPassword(pw): string` (scrypt, `salt:hash` hex), `verifyPassword(pw, stored): boolean`
- `createSession(userId): Promise<string>` (token, 30d), `destroySession(token)`, `setSessionCookie(res, token)`, `clearSessionCookie(res)`
- `getSession(req): Promise<{user: User, org: Organization, role: string} | null>` — reads `pos_session` cookie, joins membership. Also `requireAuth(req)` that throws/returns null → routes must use pattern: `const session = await getSession(req); if (!session) return unauthorized();`
- `DEFAULT_STATUSES`, `DEFAULT_PRIORITIES`, `DEFAULT_ISSUE_TYPES`, `DEFAULT_LABELS` constants + `seedOrgDefaults(orgId)` used by signup + seed script.

## Task log

---
Task ID: 1
Agent: coordinator (main)
Task: Schema + foundation

Work Log:
- Read uploaded blueprint (2441 lines), adapted stack to sandbox constraints (Next.js API routes instead of NestJS, SQLite instead of Postgres, custom cookie sessions instead of Keycloak; concept multi-tenancy via org scoping kept)
- Wrote prisma/schema.prisma (14 models), pushed with `bun run db:push`, fresh db/custom.db

Stage Summary:
- DB layer ready. All models org-scoped (orgId) for tenant isolation. Issue.key denormalized for search.

---
Task ID: 2
Agent: coordinator (main)
Task: API contract + architecture

Work Log:
- Locked architecture decisions, DTO shapes, endpoint list, workflow/automation rules, demo accounts, design language (see above)

Stage Summary:
- Contract above is BINDING for Tasks 4-a (backend) and 4-b (frontend).

---
Task ID: 4-a
Agent: full-stack-developer (backend)
Task: Implement all ProjectOS API route handlers

Work Log:
- Read worklog.md contract + inspected prisma/schema.prisma, src/lib/auth.ts (getSession/hashPassword/verifyPassword/createSession/destroySession/sessionCookieOptions/SESSION_COOKIE/seedOrgDefaults/DEFAULT_*), src/lib/workflow.ts (transitionIssue/logActivity/notify/notifyMentions/WorkflowError)
- Created `src/lib/dto.ts` — full DTO types per contract (UserDTO/OrgDTO/MemberDTO/ProjectDTO/TypeDTO/StatusDTO/PriorityDTO/LabelDTO/SprintDTO/CommentDTO/ActivityDTO/NotificationDTO/IssueDTO), shared `issueInclude` (type, status, priority, assignee, reporter, project key/name, labels, subtask status categories, _count comments/subtasks) and mappers toIssueDTO/toUserDTO/toMemberDTO/toProjectDTO/toSprintDTO/toCommentDTO/toActivityDTO/toNotificationDTO etc. IssueDTO includes commentCount, subtaskCount, subtasksDone, projectKey, projectName as required.
- Created `src/lib/api-helpers.ts` — `handle()` wrapper (WorkflowError → its status, ApiError → status, Prisma P2002 → 409, else 500), `unauthorized/forbidden/badRequest/notFound/jsonError`, `parseBody` + typed field parsers (reqStr/optStr/optStrOrNull/idOrNull/optNumOrNull/optBool/optStrArr/optDateOrNull — idOrNull treats null/"" as "clear the field"), `clip()` for long activity values, `canWrite()` (VIEWER is read-only), `notifyOrgMembers()` fan-out.
- Implemented 24 route files (all `export const dynamic = "force-dynamic"`, Next.js 16 Promise params, tenant isolation via session.org.id on every query, 404 for cross-tenant reads):
  - auth/signup (email unique 409, password ≥ 6, slug sanitized + unique-ified -2/-3…, user+org+ADMIN membership+seedOrgDefaults, session cookie), auth/login (401 invalid creds, 400 "No workspace" when no membership, first-org join), auth/logout (destroys session, clears cookie), auth/me
  - workspace (user, org, role, members with role, projects with lead+issueCount, ordered issueTypes/statuses/priorities/labels)
  - projects GET/POST (key regex A-Z0-9 2-10 chars, org+key unique 409, lead must be member, activity project.created), projects/[projectId] GET (issues+sprints+activity max 20 incl. issue events via `OR [projectId, issue.projectId]` + stats {total,todo,inProgress,done,points,donePoints,overdue}) / PATCH (incl. archived→archivedAt) / DELETE (ADMIN only 403)
  - issues POST (interactive transaction: max number per project +1, key = `${projectKey}-${number}`, default status = first by order (Backlog), validates type/priority/assignee-membership/sprint-same-project/parent-same-project/labels org-scoped, activity issue.created, notify assignee), issues/[issueId] GET (issue+comments asc+activity desc 50+subtasks), PATCH (statusId MUST go through transitionIssue; per-field issue.updated activity rows with field/oldValue/newValue for type/priority/sprint/summary/description/storyPoints/dueDate/estimateHours/remainingHours/order/labels; assignment change → issue.assigned activity + notify assignee; sprintId:null unassigns; labelIds replaces the set transactionally), DELETE
  - issues/[issueId]/comments POST (activity comment.created, notify assignee+reporter minus actor, notifyMentions with org members minus actor), comments/[commentId] DELETE (author or ADMIN, 403 otherwise)
  - sprints POST (FUTURE, order=max+1), sprints/[sprintId] PATCH (→ACTIVE rejected 409 if another ACTIVE in project; →COMPLETED moves unfinished (status.category != DONE) to backlog and keeps finished; sprint.started/sprint.completed activities + notifyOrgMembers), DELETE (issues → backlog first)
  - dashboard (stats {myOpen,totalIssues,openIssues,completedThisWeek,activeSprints}, myIssues max 8, upcomingDue max 5 ordered by dueDate asc (overdue surface first), activity max 12, createdVsResolved last 14 days MM-DD buckets, activeSprintCards with total/done/points/donePoints)
  - notifications GET (last 50 + unread count), notifications/read POST ({ids?} empty/missing = mark all)
  - search GET ?q= (SQLite contains = case-insensitive ASCII; issues match key/summary/description max 12, projects match key/name max 5, org-scoped)
  - reports/burndown ?sprintId= (sprint date range or last-14-days fallback, day-by-day remaining = total − Σ storyPoints DONE with updatedAt ≤ endOfDay, clamped ≥ 0, ideal linear total→0, ≤91 days), reports/velocity ?projectId= (COMPLETED+ACTIVE sprints, committed/completed from storyPoints, sorted ascending by startDate/endDate/createdAt, most recent 8), reports/overview ?projectId= (statusDist/priorityDist/typeDist via groupBy against ordered org config rows, assigneeLoad open vs done per member, open desc)
  - members POST (ADMIN/MANAGER only 403; find-or-create user with random scrypt password + random avatar color; duplicate membership 409; activity member.joined), members/[userId] PATCH (ADMIN only, role validated)
- Verified: `bunx eslint src/app/api src/lib/dto.ts src/lib/api-helpers.ts` → 0 problems (the 4 repo lint errors are in src/components/portal/** — frontend agent's files, untouched); dev.log compiles all routes with no errors; smoke-tested ~50 live requests (signup/login/me/workspace, project CRUD+409 dup key, issue create numbering SMK-1/SMK-2 + default Backlog status, workflow status change + invalid status 400, field PATCHes with null semantics, comments+mentions+delete, subtasks + subtasksDone, sprint lifecycle incl. 409 double-ACTIVE + unfinished→backlog, project stats, dashboard, burndown/velocity/overview, search scoping, member invite/role patch, 401s, cross-tenant 404s, invalid date 400) — all behaved per contract; all smoke data deleted afterwards (DB back to empty, ready for prisma/seed.ts).

Stage Summary:
- All contract endpoints implemented in src/app/api/** (24 route files) + new src/lib/dto.ts and src/lib/api-helpers.ts. No changes to page.tsx/layout.tsx/components/auth.ts/workflow.ts/db.ts.
- Deviations/notes: (1) success status is always 200 (contract listed no 201s); (2) VIEWER role is read-only on all write endpoints (403) — contract only specified role rules for project DELETE / members POST / members PATCH, this is an addition; (3) project POST/PATCH allowed for ADMIN/MANAGER/MEMBER; (4) velocity `committed` = sum of storyPoints of issues CURRENTLY in the sprint (after completion, unfinished issues were moved to backlog, so committed reflects the finished set); burndown total likewise reflects current sprint membership; (5) velocity returns the most recent 8 sprints in ascending order (contract said "order asc, max 8"); (6) `order` field changes also write issue.updated activity rows (contract said every changed field); (7) issue POST body has no statusId — default is the org's first status by order (Backlog); (8) emails are lowercased on signup/login/invite; (9) new files src/lib/api-helpers.ts + src/lib/dto.ts exist — frontend agent should not create files with these names; (10) prisma/seed.ts referenced by worklog does not exist yet and demo data is NOT in the DB — coordinator/seed task still needs to run it before demo login works; (11) Prisma default FK actions mean whole-Organization deletes fail when issues exist (Issue.typeId/statusId are required → RESTRICT) — not exposed by any endpoint, but seed/reset scripts should delete children before orgs.

---
Task ID: 4-b
Agent: full-stack-developer (frontend)
Task: Build ProjectOS SPA portal UI

Work Log:
- Read worklog contract + `src/lib/auth.ts` / `src/lib/workflow.ts`; ran fullstack init script
- Built lib layer: `src/lib/portal-types.ts` (strict DTOs), `src/lib/api-client.ts` (`apiFetch<T>` throwing Error from `{error}`, namespaced endpoint fns), `src/lib/portal-store.ts` (zustand: session/workspace, view switching, project tab, openIssueId, projectDataVersion bump-to-refetch, global dialogs, notifications with polling/mark-read)
- Built 28 components under `src/components/portal/`: PortalApp (auth bootstrap via GET /api/workspace → AuthView | shell), AuthView (split-screen, login/signup with slug auto-suggest, demo-account button sarah@acme.dev), Sidebar (dark gradient, org slug chip, project list, user menu; mobile overlay drawer), TopBar (breadcrumbs, ⌘K search button, notifications bell popover with unread badge + mark-all-read, Create dropdown), DashboardView (4 KPI StatCards, My Issues, Active sprint progress cards, Upcoming due, Activity feed, Created-vs-Resolved recharts AreaChart), ProjectsView + ProjectDialog (create/edit, color swatches + lucide icon picker, key auto-suggest ≤5), ProjectView (header + amber-underline Tabs), BoardView (dnd-kit kanban, per-status droppable columns + cards, midpoint float ordering, DragOverlay, optimistic patchIssue({statusId,order}), shared FilterBar), BacklogView (sprint sections + backlog droppables, patchIssue({sprintId}), start/complete/edit/delete sprint dialogs, inline issue creation row), IssuesTableView (sortable table, inline status select via workflow, CSV export), ReportsView (Burndown line, Velocity bars, Status/Type pies, Priority bar, Team workload horizontal bars, all 280px ResponsiveContainer), IssuePanel (560px Sheet: inline summary edit, react-markdown description, full properties grid patching on change, labels multi-toggle, subtasks + add, comments with @mention hint and delete, activity timeline, ADMIN/MANAGER delete with confirm), CreateIssueDialog, TeamView (invite + role change), SettingsView (org card with slug copy, project settings reusing ProjectDialog), SearchPalette (cmdk ⌘K, KEY-n jump, assignee:me, debounced /api/search, grouped results), shared primitives (Avatar/AvatarStack, IssueTypeIcon/ProjectIcon, PriorityIcon, StatusBadge/StatusDot, KeyBadge, EmptyState, StatCard, RelativeTime, IssueCard, issue-filters)
- Wired `src/app/page.tsx` → `<PortalApp />`; `src/app/layout.tsx` metadata only
- Fixed lint issues (missing DragOverlay import, lucide `Infinite` typo breaking compile, react-hooks static-components + set-state-in-effect); verified end-to-end against live API (signup→workspace→project→issues→sprint start→workflow status→comments→dashboard→notifications→search→reports→members→delete) — all contract-shaped 200s; `bun run lint` clean; GET / 200

Stage Summary:
- Portal SPA complete at `/` (single route): auth → dashboard/projects/project(board|backlog|issues|reports|settings)/team/settings, global issue panel + create dialogs + search palette + notifications. Store shape and file inventory in `agent-ctx/4-b-full-stack-developer.md`.
- Backend assumptions: workspace doubles as /me; sprint list for panel via GET project detail; float order with midpoint insertion for board ordering; demo login needs prisma/seed.ts (4-a) to be run.

---
Task ID: 4-b
Agent: full-stack-developer (frontend) — completed via coordinator after context timeout
Task: Build ProjectOS SPA portal UI

Work Log:
- Agent wrote ~6,500 lines across 29 files (PortalApp, AuthView, Sidebar, TopBar, Dashboard/Projects/Project/Board/Backlog/IssuesTable/Reports/Team/Settings views, IssuePanel, CreateIssueDialog, SearchPalette, shared atoms, zustand store, typed api-client) but timed out before handover/lint
- Coordinator verified lint-clean state and completed integration

Stage Summary:
- Full SPA complete at `/` only. Store: view (dashboard|projects|project|team|settings), activeProjectId, projectTab (board|backlog|issues|reports|settings), openIssueId, workspace cache, notifications, dialogs. Deep-link `/?issue=WEB-12` opens panel.

---
Task ID: 5
Agent: coordinator (main)
Task: Demo seed

Work Log:
- Wrote prisma/seed.ts (5 users, Acme Corp, 3 projects, 5 sprints, 41 issues incl. epics+subtasks, labels, comments with mentions, activity history, notifications)
- Backdated createdAt/updatedAt via raw SQL so burndown + created-vs-resolved charts have real curves

Stage Summary:
- Demo login: sarah@acme.dev / demo1234 (all users share demo1234). Re-run anytime: `bun prisma/seed.ts` (wipes DB first).

---
Task ID: 6
Agent: coordinator (main)
Task: Integration + smoke tests

Work Log:
- API smoke-tested via curl: auth/login, workspace, dashboard, project detail, issue detail, search, burndown, velocity, overview, issue create/patch/delete, comments+mentions (verified Aisha received mention+comment+assignment notifications), sprint guard (409 on second ACTIVE), sprint complete (unfinished → backlog, then restored)
- WEB-20 created via UI dialog as live test (kept as realistic backlog item)

Stage Summary:
- All 24 endpoints behave per contract. Tenant isolation + role checks active.

---
Task ID: 7
Agent: coordinator (main)
Task: Browser QA (agent-browser) + fixes

Work Log:
- BUG 1 FIXED: `useProjectData must be used inside <ProjectView>` crash — provider passed null context while loading; added `useProjectDataContext()` nullable hook for the shell, guarded hook for tabs (project-data.tsx, ProjectView.tsx)
- BUG 2 FIXED: dnd-kit drag dead in Board + Backlog — custom `onPointerDown` prop was spread AFTER `{...listeners}`, clobbering the PointerSensor listener; changed to `onPointerDownCapture`. Verified drag WEB-8 → In Review persists via API
- BUG 3 FIXED: horizontal overflow on mobile — recharts SVGs inside grids blocked shrinking; added `[&>*]:min-w-0` to dashboard/reports grids. Mobile scrollWidth now 390 = viewport
- Verified end-to-end: demo login, dashboard KPIs/charts/activity, projects grid, kanban board (5 columns, filters), issue panel (status via select, inline comments, @mention, activity feed, subtask input), backlog (sprint sections, ACTIVE badge, create sprint), reports (burndown, velocity, status/priority/type donuts, team workload, snapshot bar), team (roles), notifications (badge, popover, click-through opens panel, mark read), search palette (⌘K, text + issue-key lookup), create issue dialog, settings (org card, project edit/archive/delete), mobile drawer + responsive layouts
- agent-browser errors clean; `bun run lint` clean

Stage Summary:
- Portal is fully interactive and browser-verified. Known minor: Escape inside a select inside a dialog closes both (shadcn default; acceptable). Next-phase ideas: JQL-lite advanced filters, webhook/automation UI, roadmap/Gantt, CSV export already in IssuesTable, attachments, saved filters, dark mode.

---
Task ID: 8
Agent: coordinator (main)
Task: Handover + recurring review

Work Log:
- Worklog updated; 15-minute webDevReview cron scheduled (assess → QA via agent-browser → fix/improve loop)

Stage Summary:
- Project Phase 1–3 (Foundation, Core Issues, Agile) complete per blueprint §40. Configuration-engine UI (workflow designer, custom fields) + Automation UI + JQL are the main unbuilt areas.

---
Task ID: 9 (webDevReview round 1 — 2026-09-23 09:06 PKT)
Agent: coordinator (cron review)
Task: Assess → QA → fix → extend (JQL search, saved filters, automations, dark mode)

Work Log:
STATUS ASSESSMENT
- Server healthy (200), lint clean, no page errors. Dev.log showed `workspace 401 → login 200 → workspace 401` — investigated with a fresh browser: login → bootstrap works perfectly; the 401s came from a stale agent-browser daemon racing two sessions (app faultless). One "blank page" sighting was also a stuck agent-browser session (two daemons); resolved by closing and relaunching.

BUGS FOUND & FIXED
- BUG 4: `runAutomations` wiring referenced undefined `actor` in issues POST route (route uses `session.user`, not `actor`) → 500 on issue creation; fixed. Residue: WEB-21/22/23/24 test issues created despite 500 (transaction committed before throw) — deleted.
- BUG 5: automation actions crashed on SQLite — `mode: "insensitive"` is unsupported by the SQLite connector; replaced with JS-side case-insensitive matching (find over org-scoped rows). Verified: creating a Bug + moving to In Progress now applies label `security` AND notifies Marcus ("label +security, notified member" on rule run stats).
- Sweep collateral fixed: StatCard violet tint class mangled during token sweep; AuthView dark brand panel had token classes that break on light bg; `text-violet-400` contrast in light mode corrected to violet-700.

FEATURES ADDED (Phase 4 continues per blueprint §24/§19)
1. JQL-lite engine (`src/lib/jql.ts`): lexer → recursive-descent parser → AST → safe Prisma where-builder. 14 fields (status/type/priority/assignee/reporter/sprint/project/summary/description/label/points/due/created/updated), operators = / != / ~, AND/OR with parentheses, values: "me", "none", "active/backlog/overdue/7d/today". POST /api/search/advanced.
2. Saved filters: SavedFilter model + GET/POST /api/filters + DELETE /api/filters/[id]; AdvancedSearchView with query bar, live parse errors, example chips, syntax help dialog, results list, save dialog; sidebar "Saved filters" section (click to run).
3. Automation engine (`src/lib/automation.ts`): event-driven rules (issue.created / status_changed / assigned / comment.created), conditions (equals/notEquals/contains on 7 fields), 8 action types (assign/unassign/transition/set priority/add+remove label/notify member/notify assignee). Fire-and-forget, loop-safe, run stats (runCount/lastRunAt/lastRunResult) on rule rows. Wired into issues POST/PATCH + comments POST.
4. Automation builder UI: AutomationsView (sidebar "Automation") with rule cards (WHEN→IF→THEN pipeline chips, enable toggle, run stats, edit/delete) + no-code RuleDialog (trigger select, condition rows, action rows with typed value pickers).
5. Dark mode: next-themes ThemeProvider (class strategy) + warm-stone dark palette in globals.css (amber primary survives both modes) + user-menu theme switcher (Light/Dark/System). Bulk token sweep of 25 portal files (stone-*/white → foreground/muted/card/border tokens) so all views follow the theme; Sidebar + AuthView brand panel intentionally stay dark.
6. Styling polish: StatCards get accent glow + hover lift + tabular-nums; TopBar titles for Search/Automation views.

VERIFICATION
- API: JQL queries return correct issue sets; bad queries return precise parser errors with position hints; filters/automations CRUD verified; automation e2e (create Bug → move → label + notification) passed.
- Browser: saved filter click seeds + runs query; automation builder create flow works (rule card appears, toast confirms); dark mode verified on dashboard/board/panel/automations; light mode restored intact; mobile search view no overflow (390=390); lint clean.

Stage Summary:
- Phase 4 (Configuration/Extensibility) substantially advanced: JQL search + saved filters + automation engine/builder + dark mode now live. Remaining from blueprint: workflow designer (visual), custom fields, roadmap/Gantt, attachments (S3-style), mentions-in-editor, webhook/API-key admin UI, email digests.
- Known minor: Escape inside a Select inside a Dialog closes both (shadcn default); automation value selects show empty placeholder until clicked; dev-tools overlay can intercept clicks in preview (dev-only).
- Recommended next: workflow transition designer UI, custom field engine (schema exists in blueprint §9), roadmap timeline, CSV export column config, board WIP limits.
