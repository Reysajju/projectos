/**
 * ProjectOS demo seed — run: bun prisma/seed.ts
 * Creates the Acme Corp workspace with users, projects, sprints,
 * ~45 issues, comments, activity history and notifications.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, seedOrgDefaults } from "../src/lib/auth";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number, jitter = 0) => new Date(now - n * day + jitter * day * Math.random());
const daysAhead = (n: number) => new Date(now + n * day);

async function clean() {
  const tables = [
    "webhookDelivery", "webhook", "attachment",
    "notification", "activity", "comment", "issueLabel", "issue",
    "sprint", "project", "label", "priority", "status", "issueType",
    "organizationMember", "organization", "session", "user",
  ];
  for (const t of tables) {
    await (db as any)[t].deleteMany({});
  }
}

async function main() {
  console.log("🌱 Seeding ProjectOS demo data…");
  await clean();

  const password = hashPassword("demo1234");

  // ─── Users ────────────────────────────────────────────────────
  const [sarah, marcus, aisha, tom, lena] = await Promise.all([
    db.user.create({ data: { email: "sarah@acme.dev", name: "Sarah Chen", passwordHash: password, avatarColor: "#d97706", title: "Product Lead" } }),
    db.user.create({ data: { email: "marcus@acme.dev", name: "Marcus Webb", passwordHash: password, avatarColor: "#059669", title: "Backend Lead" } }),
    db.user.create({ data: { email: "aisha@acme.dev", name: "Aisha Patel", passwordHash: password, avatarColor: "#7c3aed", title: "Frontend Engineer" } }),
    db.user.create({ data: { email: "tom@acme.dev", name: "Tom Okafor", passwordHash: password, avatarColor: "#0d9488", title: "QA Engineer" } }),
    db.user.create({ data: { email: "lena@acme.dev", name: "Lena Brandt", passwordHash: password, avatarColor: "#e11d48", title: "Product Designer" } }),
  ]);

  // ─── Organization ─────────────────────────────────────────────
  const org = await db.organization.create({ data: { name: "Acme Corp", slug: "acme" } });
  await db.organizationMember.createMany({
    data: [
      { orgId: org.id, userId: sarah.id, role: "ADMIN" },
      { orgId: org.id, userId: marcus.id, role: "MANAGER" },
      { orgId: org.id, userId: aisha.id, role: "MEMBER" },
      { orgId: org.id, userId: tom.id, role: "MEMBER" },
      { orgId: org.id, userId: lena.id, role: "MEMBER" },
    ],
  });
  await seedOrgDefaults(org.id);

  // ─── Custom fields (org-wide definitions) ─────────────────────
  const cfEnv = await db.customField.create({ data: { orgId: org.id, name: "Environment", type: "SELECT", options: JSON.stringify(["Production", "Staging", "Development"]), order: 0 } });
  await db.customField.create({ data: { orgId: org.id, name: "Release build", type: "TEXT", order: 1 } });
  await db.customField.create({ data: { orgId: org.id, name: "Regression risk", type: "CHECKBOX", order: 2 } });
  const cfGA = await db.customField.create({ data: { orgId: org.id, name: "GA window", type: "DATE", order: 3 } });

  const types = await db.issueType.findMany({ where: { orgId: org.id } });
  const statuses = await db.status.findMany({ where: { orgId: org.id } });
  const priorities = await db.priority.findMany({ where: { orgId: org.id } });
  const labels = await db.label.findMany({ where: { orgId: org.id } });

  const T = (n: string) => types.find((t) => t.name === n)!.id;
  const S = (n: string) => statuses.find((s) => s.name === n)!.id;
  const P = (n: string) => priorities.find((p) => p.name === n)!.id;
  const L = (n: string) => labels.find((l) => l.name === n)!.id;

  // ─── Projects ─────────────────────────────────────────────────
  const web = await db.project.create({ data: { orgId: org.id, key: "WEB", name: "Website Redesign", description: "Full overhaul of the marketing site: new design system, CMS migration and performance budget.", color: "#d97706", icon: "rocket", leadId: sarah.id, createdAt: daysAgo(30) } });
  const app = await db.project.create({ data: { orgId: org.id, key: "APP", name: "Mobile Application", description: "Cross-platform customer app — React Native, offline-first sync, push notifications.", color: "#059669", icon: "smartphone", leadId: marcus.id, createdAt: daysAgo(24) } });
  const ai = await db.project.create({ data: { orgId: org.id, key: "AI", name: "AI Platform", description: "Internal ML platform: embeddings service, semantic search and copilot APIs.", color: "#7c3aed", icon: "brain-circuit", leadId: aisha.id, createdAt: daysAgo(12) } });

  // ─── Sprints ──────────────────────────────────────────────────
  const webS1 = await db.sprint.create({ data: { projectId: web.id, name: "WEB Sprint 1", goal: "Ship the new landing page and design tokens.", startDate: daysAgo(21), endDate: daysAgo(7), status: "COMPLETED", order: 0 } });
  const webS2 = await db.sprint.create({ data: { projectId: web.id, name: "WEB Sprint 2", goal: "Pricing page, blog CMS migration and Lighthouse ≥ 95.", startDate: daysAgo(7), endDate: daysAhead(7), status: "ACTIVE", order: 1 } });
  const webS3 = await db.sprint.create({ data: { projectId: web.id, name: "WEB Sprint 3", goal: "Docs section and i18n scaffolding.", status: "FUTURE", order: 2 } });
  const appS1 = await db.sprint.create({ data: { projectId: app.id, name: "APP Sprint 1", goal: "Auth flows + offline sync foundation.", startDate: daysAgo(3), endDate: daysAhead(11), status: "ACTIVE", order: 0 } });
  const appS2 = await db.sprint.create({ data: { projectId: app.id, name: "APP Sprint 2", goal: "Push notifications and app store release prep.", status: "FUTURE", order: 1 } });

  // ─── Board WIP limits (WEB project) ───────────────────────────
  await db.project.update({
    where: { id: web.id },
    data: { wipLimits: JSON.stringify({ [S("In Progress")]: 4, [S("In Review")]: 3 }) },
  });

  // ─── Workflow transitions (restricted demo graph) ─────────────
  // A realistic software workflow: every sensible move is an edge,
  // odd jumps (e.g. Backlog → Done) are rejected by the engine.
  const FLOW_EDGES: [string, string][] = [
    ["Backlog", "To Do"],
    ["Backlog", "In Progress"],
    ["To Do", "In Progress"],
    ["To Do", "Backlog"],
    ["In Progress", "In Review"],
    ["In Progress", "To Do"],
    ["In Review", "Done"],
    ["In Review", "In Progress"],
    ["Done", "In Progress"],
  ];
  await db.workflowTransition.createMany({
    data: FLOW_EDGES.map(([from, to]) => ({
      orgId: org.id,
      fromStatusId: S(from),
      toStatusId: S(to),
    })),
  });

  // ─── Issue factory ────────────────────────────────────────────
  const counters: Record<string, number> = {};
  async function mk(opts: {
    project: { id: string; key: string; orgId: string };
    type: string; summary: string; description?: string;
    status?: string; priority?: string; assignee?: typeof sarah | null;
    reporter?: typeof sarah; sprint?: string | null; points?: number | null;
    due?: Date | null; start?: Date | null; labels?: string[]; parent?: { id: string };
    created?: Date; epicName?: string;
  }) {
    const number = (counters[opts.project.key] ?? 0) + 1;
    counters[opts.project.key] = number;
    const issue = await db.issue.create({
      data: {
        orgId: opts.project.orgId,
        projectId: opts.project.id,
        number,
        key: `${opts.project.key}-${number}`,
        typeId: T(opts.type),
        statusId: S(opts.status ?? "Backlog"),
        priorityId: opts.priority ? P(opts.priority) : null,
        summary: opts.summary,
        description: opts.description ?? null,
        reporterId: (opts.reporter ?? sarah).id,
        assigneeId: opts.assignee === undefined ? null : opts.assignee?.id ?? null,
        sprintId: opts.sprint ?? null,
        storyPoints: opts.points ?? null,
        startDate: opts.start ?? null,
        dueDate: opts.due ?? null,
        parentId: opts.parent?.id ?? null,
        createdAt: opts.created ?? daysAgo(18 - (number % 15)),
        labels: opts.labels ? { create: opts.labels.map((l) => ({ labelId: L(l) })) } : undefined,
      },
    });
    await db.activity.create({
      data: { orgId: org.id, userId: (opts.reporter ?? sarah).id, issueId: issue.id, projectId: opts.project.id, type: "issue.created", newValue: issue.key, createdAt: issue.createdAt },
    });
    return issue;
  }

  async function comment(issue: { id: string; key: string; assigneeId: string | null; reporterId: string | null; orgId: string }, author: typeof sarah, body: string, ago: number) {
    await db.comment.create({ data: { issueId: issue.id, authorId: author.id, body, createdAt: daysAgo(ago) } });
    await db.activity.create({ data: { orgId: org.id, userId: author.id, issueId: issue.id, projectId: null, type: "comment.created", createdAt: daysAgo(ago) } });
  }

  async function move(issue: { id: string; key: string; orgId: string; projectId: string; reporterId: string | null; assigneeId: string | null }, actor: typeof sarah, from: string, to: string, ago: number) {
    await db.issue.update({ where: { id: issue.id }, data: { statusId: S(to) } });
    await db.activity.create({ data: { orgId: org.id, userId: actor.id, issueId: issue.id, projectId: issue.projectId, type: "issue.status_changed", field: "status", oldValue: from, newValue: to, createdAt: daysAgo(ago) } });
  }

  // ═══ WEB project (20 issues) ══════════════════════════════════
  const webEpic1 = await mk({ project: web, type: "Epic", epicName: "", summary: "Design System 2.0", description: "Tokens, components and documentation for the new brand.", priority: "High", assignee: lena, sprint: null, points: null, start: daysAgo(21), due: daysAhead(10) });
  const webEpic2 = await mk({ project: web, type: "Epic", summary: "Marketing Site Relaunch", description: "New landing, pricing, about and blog — on the new design system.", priority: "Highest", assignee: sarah, start: daysAgo(7), due: daysAhead(32) });

  const w1 = await mk({ project: web, type: "Story", summary: "Implement design tokens (colors, spacing, typography)", description: "Export Figma variables to CSS custom properties and Tailwind theme.\n\n- [x] Color ramp\n- [x] Spacing scale\n- [ ] Dark mode ramp", status: "Done", priority: "High", assignee: lena, sprint: webS1.id, points: 8, labels: ["design", "frontend"], created: daysAgo(20) });
  const w2 = await mk({ project: web, type: "Story", summary: "New landing page hero with product animation", description: "Lottie-based hero animation, reduced-motion fallback.", status: "Done", priority: "Highest", assignee: aisha, sprint: webS1.id, points: 5, labels: ["frontend", "design"] });
  const w3 = await mk({ project: web, type: "Task", summary: "Set up Next.js + Tailwind project skeleton", status: "Done", priority: "Medium", assignee: aisha, sprint: webS1.id, points: 3, labels: ["frontend"] });
  const w4 = await mk({ project: web, type: "Bug", summary: "Hero animation janky on Safari 16", description: "Frame drops on scroll-linked animation. Likely `will-change` misuse.", status: "Done", priority: "High", assignee: aisha, sprint: webS1.id, points: 2, labels: ["frontend", "performance"] });
  await move(w1, lena, "To Do", "Done", 9);
  await move(w2, aisha, "In Progress", "Done", 8);
  await move(w3, aisha, "To Do", "Done", 12);
  await move(w4, tom, "In Review", "Done", 8);

  const w5 = await mk({ project: web, type: "Story", summary: "Pricing page with plan comparison table", description: "Three tiers, monthly/annual toggle, FAQ accordion.", status: "In Progress", priority: "High", assignee: aisha, sprint: webS2.id, points: 8, start: daysAgo(6), due: daysAhead(4), labels: ["frontend", "design"] });
  const w6 = await mk({ project: web, type: "Task", summary: "Migrate blog to MDX pipeline", status: "In Progress", priority: "Medium", assignee: marcus, sprint: webS2.id, points: 5, start: daysAgo(4), due: daysAhead(6), labels: ["backend"] });
  const w7 = await mk({ project: web, type: "Task", summary: "Performance budget: Lighthouse ≥ 95 on mobile", description: "Image optimization, font subsetting, route prefetch audit.", status: "In Progress", priority: "Highest", assignee: aisha, sprint: webS2.id, points: 5, due: daysAhead(2), labels: ["performance"] });
  const w8 = await mk({ project: web, type: "Story", summary: "Testimonials carousel with customer logos", status: "In Review", priority: "Low", assignee: lena, sprint: webS2.id, points: 3, labels: ["design", "frontend"] });
  const w9 = await mk({ project: web, type: "Bug", summary: "Annual toggle shows wrong discount on pricing", status: "In Review", priority: "High", assignee: aisha, sprint: webS2.id, points: 2, due: daysAhead(1), labels: ["frontend"] });
  const w10 = await mk({ project: web, type: "Task", summary: "SEO meta + OpenGraph audit", status: "To Do", priority: "Medium", assignee: tom, sprint: webS2.id, points: 2, labels: ["frontend"] });
  const w11 = await mk({ project: web, type: "Story", summary: "Docs section with sidebar navigation", status: "To Do", priority: "Medium", assignee: aisha, sprint: webS3.id, points: 8, labels: ["frontend", "ux"] });
  const w12 = await mk({ project: web, type: "Task", summary: "i18n scaffolding (en, de)", status: "Backlog", priority: "Low", assignee: marcus, points: 5, labels: ["backend"] });
  const w13 = await mk({ project: web, type: "Bug", summary: "404 page missing after CMS migration", status: "Backlog", priority: "Medium", assignee: null, points: 1, labels: ["frontend"] });
  const w14 = await mk({ project: web, type: "Story", summary: "Customer case studies template", status: "Backlog", priority: "Low", assignee: lena, points: 5, labels: ["design"] });
  const w15 = await mk({ project: web, type: "Task", summary: "Cookie consent + analytics plumbing", status: "Backlog", priority: "Low", assignee: null, labels: ["security"] });

  // subtasks under w5
  const w5a = await mk({ project: web, type: "Sub-task", summary: "Pricing table component", status: "Done", priority: "Medium", assignee: aisha, parent: w5, points: 2, labels: ["frontend"] });
  const w5b = await mk({ project: web, type: "Sub-task", summary: "FAQ accordion with anchor links", status: "In Progress", priority: "Medium", assignee: aisha, parent: w5, points: 1, labels: ["frontend"] });
  await move(w5a, aisha, "To Do", "Done", 2);

  // ═══ APP project (15 issues) ══════════════════════════════════
  const appEpic1 = await mk({ project: app, type: "Epic", summary: "Offline-first sync engine", description: "Local queue, conflict resolution, background refresh.", priority: "Highest", assignee: marcus, start: daysAgo(3), due: daysAhead(25) });
  const a1 = await mk({ project: app, type: "Story", summary: "Biometric login (Face ID / fingerprint)", description: "expo-local-authentication, fallback to PIN.", status: "Done", priority: "High", assignee: marcus, sprint: appS1.id, points: 8, labels: ["backend", "security"], created: daysAgo(15) });
  const a2 = await mk({ project: app, type: "Task", summary: "React Native upgrade to 0.76 + New Architecture", status: "Done", priority: "High", assignee: aisha, sprint: appS1.id, points: 5, labels: ["frontend"] });
  const a3 = await mk({ project: app, type: "Story", summary: "Local mutation queue with retry/backoff", status: "In Progress", priority: "Highest", assignee: marcus, sprint: appS1.id, points: 13, start: daysAgo(3), due: daysAhead(3), labels: ["backend"] });
  const a4 = await mk({ project: app, type: "Story", summary: "Conflict resolution UI for stale edits", status: "In Progress", priority: "High", assignee: aisha, sprint: appS1.id, points: 8, due: daysAhead(5), labels: ["ux", "frontend"] });
  const a5 = await mk({ project: app, type: "Bug", summary: "Sync stalls when app backgrounded on Android", status: "In Review", priority: "High", assignee: tom, sprint: appS1.id, points: 3, due: daysAhead(2), labels: ["backend", "performance"] });
  const a6 = await mk({ project: app, type: "Task", summary: "Design offline indicator + sync status banner", status: "In Review", priority: "Medium", assignee: lena, sprint: appS1.id, points: 2, labels: ["design"] });
  const a7 = await mk({ project: app, type: "Task", summary: "E2E tests for login + sync (Detox)", status: "To Do", priority: "Medium", assignee: tom, sprint: appS1.id, points: 5, labels: ["backend"] });
  const a8 = await mk({ project: app, type: "Story", summary: "Push notification permissions primer", status: "To Do", priority: "Medium", assignee: null, sprint: appS2.id, points: 3, labels: ["ux"] });
  const a9 = await mk({ project: app, type: "Task", summary: "App store screenshots + listing copy", status: "Backlog", priority: "Low", assignee: lena, sprint: appS2.id, points: 2, labels: ["design"] });
  const a10 = await mk({ project: app, type: "Bug", summary: "Keyboard covers comment input on small iPhones", status: "Backlog", priority: "Medium", assignee: null, points: 2, labels: ["frontend"] });
  const a11 = await mk({ project: app, type: "Story", summary: "Deep linking for issue keys (pos://issue/WEB-12)", status: "Backlog", priority: "Low", assignee: null, points: 5, labels: ["backend"] });
  const a12 = await mk({ project: app, type: "Task", summary: "Crash reporting + release health dashboard", status: "Backlog", priority: "Medium", assignee: marcus, points: 3, labels: ["backend"] });

  // ═══ AI project (10 issues) ═══════════════════════════════════
  const aiEpic1 = await mk({ project: ai, type: "Epic", summary: "Semantic Search v1", description: "Embeddings pipeline + hybrid retrieval + evaluation harness.", priority: "High", assignee: aisha, start: daysAgo(5), due: daysAhead(21) });
  const i1 = await mk({ project: ai, type: "Task", summary: "Choose vector store (pgvector vs Qdrant benchmark)", description: "Benchmark recall@10 and p95 latency on 1M fixture vectors.", status: "Done", priority: "High", assignee: marcus, points: 5, labels: ["backend"], created: daysAgo(10) });
  const i2 = await mk({ project: ai, type: "Story", summary: "Embedding pipeline for issue text", status: "In Progress", priority: "Highest", assignee: aisha, points: 8, start: daysAgo(5), due: daysAhead(9), labels: ["backend"] });
  const i3 = await mk({ project: ai, type: "Story", summary: "Hybrid retrieval (BM25 + vector) with reranking", status: "To Do", priority: "High", assignee: marcus, points: 13, labels: ["backend", "performance"] });
  const i4 = await mk({ project: ai, type: "Task", summary: "Evaluation harness with golden dataset", status: "In Progress", priority: "Medium", assignee: tom, points: 5, labels: ["backend"] });
  const i5 = await mk({ project: ai, type: "Bug", summary: "Tokenizer drops non-ASCII issue summaries", status: "In Review", priority: "Medium", assignee: aisha, points: 2, labels: ["backend"] });
  const i6 = await mk({ project: ai, type: "Story", summary: "Copilot: draft issue from Slack thread", status: "Backlog", priority: "Medium", assignee: null, points: 8, labels: ["backend", "ux"] });
  const i7 = await mk({ project: ai, type: "Task", summary: "Cost dashboard for embedding API usage", status: "Backlog", priority: "Low", assignee: null, points: 3, labels: ["frontend"] });
  const i8 = await mk({ project: ai, type: "Task", summary: "Security review: PII scrubbing before indexing", status: "Backlog", priority: "Highest", assignee: null, points: 5, labels: ["security"], due: daysAhead(8) });

  // ═══ Custom field values on select issues ═════════════
  await db.issue.update({
    where: { id: w7.id },
    data: { customFields: JSON.stringify({ [cfEnv.id]: "Production", [cfGA.id]: daysAhead(45).toISOString() }) },
  });
  await db.issue.update({
    where: { id: w9.id },
    data: { customFields: JSON.stringify({ [cfEnv.id]: "Staging" }) },
  });
  await db.issue.update({
    where: { id: a3.id },
    data: { customFields: JSON.stringify({ [cfEnv.id]: "Development" }) },
  });
  await db.issue.update({
    where: { id: i8.id },
    data: { customFields: JSON.stringify({ [cfGA.id]: daysAhead(60).toISOString() }) },
  });

  // ═══ Comments ═════════════════════════════════════════════════
  await comment(w5, sarah, "Annual pricing numbers are final — see the shared sheet. @Aisha Patel please use the toggle spec from Figma.", 3);
  await comment(w5, aisha, "On it. Table component is done, FAQ accordion is in progress.", 2);
  await comment(w7, tom, "Mobile Lighthouse is at 91 — images are the biggest win left.", 1);
  await comment(w9, sarah, "@Tom Okafor can you QA the toggle on staging once Aisha pushes the fix?", 1);
  await comment(a3, marcus, "Queue is persisting to SQLite now; retry with exponential backoff next.", 2);
  await comment(a3, sarah, "Nice. Remember to log sync conflicts as activities so audit shows them.", 1);
  await comment(a4, lena, "Conflict sheet design is in the handoff file — reused the merge pattern from docs.", 2);
  await comment(a5, tom, "Reproduced on Pixel 8: WorkManager cancels the worker on background. Fix incoming.", 1);
  await comment(i2, marcus, "Chunking strategy: 512 tokens with 64 overlap looks best on the fixtures.", 2);
  await comment(i4, sarah, "Golden set should include non-English issues — @Aisha Patel has fixtures.", 3);
  await comment(w2, lena, "Animation timing feels perfect now. Shipping 🚀", 8);
  await comment(w1, sarah, "Dark mode ramp still open — moved to Sprint 3 scope.", 9);

  // ═══ Notifications (unread for Sarah, some for others) ═───────
  await db.notification.createMany({
    data: [
      { orgId: org.id, userId: sarah.id, type: "mentioned", title: "You were mentioned in APP-3", body: "Marcus Webb: Remember to log sync conflicts as activities so audit shows them.", issueId: a3.id, createdAt: daysAgo(1) },
      { orgId: org.id, userId: sarah.id, type: "status_changed", title: `${w9.key} moved to In Review`, body: "Aisha Patel changed status: In Progress → In Review", issueId: w9.id, createdAt: daysAgo(0.5) },
      { orgId: org.id, userId: sarah.id, type: "due_soon", title: `${w7.key} is due in 2 days`, body: "Performance budget: Lighthouse ≥ 95 on mobile", issueId: w7.id, createdAt: daysAgo(0.2) },
      { orgId: org.id, userId: sarah.id, type: "comment", title: `New comment on ${w5.key}`, body: "Aisha Patel: On it. Table component is done…", issueId: w5.id, read: true, createdAt: daysAgo(2) },
      { orgId: org.id, userId: aisha.id, type: "assigned", title: `You were assigned ${w7.key}`, body: "Performance budget: Lighthouse ≥ 95 on mobile", issueId: w7.id, createdAt: daysAgo(6) },
      { orgId: org.id, userId: marcus.id, type: "sprint", title: "APP Sprint 1 started", body: "Auth flows + offline sync foundation.", createdAt: daysAgo(3) },
    ],
  });

  // ═══ Sprint/project activities ════════════════════════════════
  await db.activity.createMany({
    data: [
      { orgId: org.id, userId: sarah.id, projectId: web.id, type: "project.created", newValue: "WEB", createdAt: daysAgo(30) },
      { orgId: org.id, userId: marcus.id, projectId: app.id, type: "project.created", newValue: "APP", createdAt: daysAgo(24) },
      { orgId: org.id, userId: aisha.id, projectId: ai.id, type: "project.created", newValue: "AI", createdAt: daysAgo(12) },
      { orgId: org.id, userId: sarah.id, projectId: web.id, type: "sprint.started", newValue: webS2.name, createdAt: daysAgo(7) },
      { orgId: org.id, userId: sarah.id, projectId: web.id, type: "sprint.completed", newValue: webS1.name, createdAt: daysAgo(7) },
      { orgId: org.id, userId: marcus.id, projectId: app.id, type: "sprint.started", newValue: appS1.name, createdAt: daysAgo(3) },
      { orgId: org.id, userId: marcus.id, userId2: undefined, type: "member.joined", newValue: "Lena Brandt", createdAt: daysAgo(20) } as never,
    ].map(({ userId2: _drop, ...rest }) => rest),
  });

  // ═══ Automation rules (demo) ═════════════════════════════════
  await db.automationRule.createMany({
    data: [
      {
        orgId: org.id,
        name: "Escalate critical bugs",
        trigger: "issue.created",
        conditions: JSON.stringify([{ field: "type", operator: "equals", value: "Bug" }]),
        actions: JSON.stringify([
          { type: "set_priority", value: "High" },
          { type: "add_label", value: "security" },
        ]),
        enabled: true,
        runCount: 6,
        lastRunAt: daysAgo(1),
        lastRunResult: "priority → High, label +security",
        createdBy: sarah.id,
        createdAt: daysAgo(18),
      },
      {
        orgId: org.id,
        name: "Alert assignee on review",
        trigger: "issue.status_changed",
        conditions: JSON.stringify([]),
        actions: JSON.stringify([{ type: "notify_assignee" }]),
        enabled: true,
        runCount: 21,
        lastRunAt: daysAgo(0.4),
        lastRunResult: "notified assignee",
        createdBy: marcus.id,
        createdAt: daysAgo(14),
      },
      {
        orgId: org.id,
        name: "Flag design work",
        trigger: "issue.assigned",
        conditions: JSON.stringify([{ field: "assignee", operator: "equals", value: lena.email }]),
        actions: JSON.stringify([{ type: "add_label", value: "design" }]),
        enabled: false,
        runCount: 3,
        lastRunAt: daysAgo(5),
        lastRunResult: "label +design",
        createdBy: sarah.id,
        createdAt: daysAgo(10),
      },
    ],
  });

  // ═══ Saved filters (demo) ════════════════════════════════════
  await db.savedFilter.createMany({
    data: [
      {
        orgId: org.id,
        name: "My open bugs",
        query: 'assignee = "me" AND type = Bug AND status != Done',
        ownerId: sarah.id,
        createdAt: daysAgo(9),
      },
      {
        orgId: org.id,
        name: "Overdue & unfinished",
        query: "due = overdue AND status != Done",
        ownerId: sarah.id,
        createdAt: daysAgo(6),
      },
      {
        orgId: org.id,
        name: "Sprint work in progress",
        query: "sprint = active AND status != Done",
        ownerId: marcus.id,
        createdAt: daysAgo(4),
      },
    ],
  });

  // ─── Webhooks (demo) ──────────────────────────────────────────
  const whSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  await db.webhook.create({
    data: {
      orgId: org.id,
      url: "http://localhost:3000/api/webhook-receiver",
      events: JSON.stringify(["issue.created", "issue.status_changed", "comment.created"]),
      secret: whSecret,
      description: "Built-in test receiver — try the Test button to see a signed delivery land.",
      active: true,
      createdBy: sarah.id,
      createdAt: daysAgo(8),
    },
  });
  await db.webhook.create({
    data: {
      orgId: org.id,
      url: "https://hooks.ci.acme.dev/projectos",
      events: JSON.stringify(["issue.created", "issue.status_changed"]),
      secret: whSecret,
      description: "CI pipeline trigger (paused — endpoint is only reachable on the VPN).",
      active: false,
      createdBy: marcus.id,
      createdAt: daysAgo(15),
    },
  });

  // ─── Attachments (demo — real files under db/uploads) ─────────
  const uploadsRoot = path.join(process.cwd(), "db", "uploads", org.id);
  fs.mkdirSync(uploadsRoot, { recursive: true });
  async function seedFile(
    issue: { id: string; key: string; projectId: string },
    uploader: typeof sarah,
    originalName: string,
    mime: string,
    content: string,
    created: Date
  ) {
    const ext = path.extname(originalName);
    const storageKey = `${created.getTime().toString(36)}-${crypto.randomBytes(9).toString("hex")}${ext}`;
    await fs.promises.writeFile(path.join(uploadsRoot, storageKey), content);
    await db.attachment.create({
      data: {
        orgId: org.id,
        issueId: issue.id,
        uploadedById: uploader.id,
        originalName,
        storageKey,
        mimeType: mime,
        size: Buffer.byteLength(content),
        checksum: crypto.createHash("sha256").update(content).digest("hex"),
        createdAt: created,
      },
    });
  }

  await seedFile(
    w9,
    aisha,
    "pricing-toggle-screenshot.svg",
    "image/svg+xml",
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280"><rect width="480" height="280" rx="12" fill="#fafaf9"/><rect x="24" y="24" width="200" height="232" rx="10" fill="#fff" stroke="#e7e5e4"/><rect x="256" y="24" width="200" height="232" rx="10" fill="#fff" stroke="#e7e5e4"/><text x="40" y="58" font-family="system-ui" font-size="14" font-weight="700" fill="#1c1917">Monthly</text><text x="40" y="88" font-family="system-ui" font-size="28" font-weight="800" fill="#d97706">$29</text><text x="272" y="58" font-family="system-ui" font-size="14" font-weight="700" fill="#1c1917">Annual −20%</text><text x="272" y="88" font-family="system-ui" font-size="28" font-weight="800" fill="#d97706">$23</text><rect x="40" y="120" width="168" height="8" rx="4" fill="#e7e5e4"/><rect x="40" y="140" width="140" height="8" rx="4" fill="#e7e5e4"/><rect x="40" y="160" width="156" height="8" rx="4" fill="#e7e5e4"/><rect x="272" y="120" width="168" height="8" rx="4" fill="#e7e5e4"/><rect x="272" y="140" width="128" height="8" rx="4" fill="#e7e5e4"/><rect x="272" y="160" width="150" height="8" rx="4" fill="#e7e5e4"/><rect x="40" y="204" width="168" height="32" rx="8" fill="#d97706"/><text x="92" y="225" font-family="system-ui" font-size="13" font-weight="600" fill="#fff">Choose plan</text><rect x="272" y="204" width="168" height="32" rx="8" fill="#1c1917"/><text x="316" y="225" font-family="system-ui" font-size="13" font-weight="600" fill="#fff">Choose plan</text></svg>`,
    daysAgo(2)
  );
  await seedFile(
    w9,
    aisha,
    "repro-steps.txt",
    "text/plain",
    `Repro: pricing page → toggle to Annual → discount shown is −25% (spec says −20%).
Browser: Chrome 129 / macOS 15.0
Frequency: 5/5
Notes: looks correct on Firefox — suspect locale-aware number formatting in usePricing() hook.`,
    daysAgo(2)
  );
  await seedFile(
    w7,
    aisha,
    "lighthouse-mobile.json",
    "application/json",
    JSON.stringify(
      {
        url: "https://staging.acme.dev/pricing",
        fetchTime: daysAgo(1).toISOString(),
        categories: { performance: 0.93, accessibility: 0.98, "best-practices": 1.0, seo: 0.97 },
        audits: { "largest-contentful-paint": { displayValue: "2.4 s" }, "cumulative-layout-shift": { displayValue: "0.04" } },
      },
      null,
      2
    ),
    daysAgo(1)
  );

  // ─── Backdate timestamps for charts (burndown / created-vs-resolved) ──
  const doneIssues = await db.issue.findMany({ where: { status: { category: "DONE" } } });
  let i = 0;
  for (const issue of doneIssues) {
    const doneAt = new Date(now - (2 + (i % 12)) * day);
    await db.$executeRawUnsafe(`UPDATE Issue SET updatedAt = ? WHERE id = ?`, doneAt.toISOString(), issue.id);
    i++;
  }
  const allIssues = await db.issue.findMany({ select: { id: true, createdAt: true } });
  for (const [idx, issue] of allIssues.entries()) {
    const at = new Date(now - (1 + (idx % 13)) * day);
    await db.$executeRawUnsafe(`UPDATE Issue SET createdAt = ? WHERE id = ?`, at.toISOString(), issue.id);
  }

  console.log("✅ Seed complete:");
  console.log(`   Users: 5 · Org: ${org.name} (${org.slug})`);
  console.log(`   Projects: WEB(${counters.WEB}) APP(${counters.APP}) AI(${counters.AI})`);
  console.log("   Login: sarah@acme.dev / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
