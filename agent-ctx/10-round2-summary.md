# Round 2 (webDevReview) — Task ID 10 — Files & Decisions

## New files
- `src/components/portal/RoadmapView.tsx` — Gantt: sprint bands, epic bars (drag move/resize), child rows, zoom, today line, unscheduled popover
- `src/components/portal/CustomFieldValue.tsx` — typed inline editor for custom fields (TEXT/NUMBER/DATE/SELECT/CHECKBOX)
- `src/app/api/custom-fields/route.ts` — GET list, POST create (canManage, unique name, SELECT options validation)
- `src/app/api/custom-fields/[fieldId]/route.ts` — PATCH rename/order/options, DELETE (values orphaned)

## Modified
- `prisma/schema.prisma` — +CustomField model; Issue.startDate, Issue.customFields (JSON str); Project.wipLimits (JSON str)
- `src/lib/db.ts` — direct `.prisma/client/client` import + signature-keyed global cache (self-heals after db:push)
- `src/lib/dto.ts` — CustomFieldDTO/parseJsonRecord/parseWipLimits; ProjectDTO.wipLimits; IssueDTO.startDate+customFields
- `src/lib/api-helpers.ts` — +canManage(role)
- `src/lib/portal-types.ts` / `api-client.ts` — DTOs + api.customFields CRUD (NOTE: on `api`, NOT api2)
- `src/app/api/workspace/route.ts` — +customFields in payload
- `src/app/api/issues/[issueId]/route.ts` — startDate (≤ dueDate guard), customFields validation + activity log
- `src/app/api/projects/[projectId]/route.ts` — wipLimits validation
- `src/components/portal/ProjectView.tsx` — Roadmap tab
- `BoardView.tsx` — WIP chips (within/at/over), column ring, advisory toast, WipLimitsDialog
- `IssuePanel.tsx` — Start date picker; Custom fields grid (uses CustomFieldValue)
- `IssuesTableView.tsx` — custom field columns + CSV; SortHeader th-in-th fix
- `SettingsView.tsx` — CustomFieldsManager card (list/create/rename/delete)
- `prisma/seed.ts` — 4 custom fields + values, epic/sprint dates, WIP limits (WEB: In Progress 4, In Review 3)

## Gotchas for next agents
- Custom-field endpoints are on `api`, not `api2` (bug 7 lesson — api2 is legacy from round 1)
- After editing prisma schema: `bun run db:push` is enough; db.ts self-heals the client cache
- agent-browser refs go stale across Radix portal re-renders — re-snapshot between steps
