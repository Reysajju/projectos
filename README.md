# ProjectOS — In-house Jira Alternative

A self-hosted, multi-tenant project management portal: kanban boards, sprints,
backlog planning, workflow engine, automations, reports, API keys, webhooks and
**full email notifications via Nodemailer SMTP**.

Built with Next.js 16 (App Router) + TypeScript, Prisma + **SQLite** (fully
independent — no Supabase, no external services), shadcn/ui and Tailwind CSS 4.

---

## Quick start

```bash
bun install
bun run db:push      # create/sync the SQLite database (db/custom.db)
bun run dev          # http://localhost:3000
```

Open the app, **Sign up** to create your workspace (you become ADMIN), or log
in with the demo account (`sarah@acme.dev` / `demo1234`).

## Email delivery (Nodemailer + app password)

All portal emails — **workspace invitations, issue assignments, status
changes, comments & @mentions, digests, password resets** — are sent through
one Nodemailer SMTP transport configured in `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop   # your 16-char Gmail App Password
MAIL_FROM="ProjectOS <you@gmail.com>"
APP_URL=https://portal.yourcompany.com
```

**Gmail app-password setup**

1. Enable 2-Step Verification on your Google account.
2. Go to myaccount.google.com → Security → **App passwords**.
3. Generate a password for "Mail", paste it into `SMTP_PASS` (spaces optional).
4. Restart the server — done. Every event now emails for real.

Other providers work the same way (Outlook: `smtp.office365.com:587`,
Fastmail: `smtp.fastmail.com:465` + `SMTP_SECURE=1`, etc.).

**Simulation mode** — with `SMTP_HOST` empty nothing is sent, but every
message is still fully rendered (HTML + text) and stored in the auditable
outbox (**Email Digest view**), where admins can preview exactly what would be
delivered. Invitations also expose a copyable claim link in this mode.

**Verify** — Settings → *Email delivery (SMTP)* shows connection status and a
**Send test email** button. Each user can mute categories under Settings →
*Email notifications* (preferences are stored per-user and default to on).

## Invitations & password flows

- **Add member** (Team view) sends an invitation email containing a
  single-use claim link (`/?claim=<token>`, valid 7 days) where the invitee
  sets their name + password and lands straight in the workspace.
- Admins can **Resend invite email** from the member menu.
- **Forgot password?** on the login screen emails a 1-hour single-use reset
  link (`/?reset=<token>`). Resetting invalidates all existing sessions.
- Tokens are stored hashed (sha256) — the raw token only ever lives in the
  email link.

## Branding & themes

- Custom **logo mark + wordmark** (`public/logo.svg`, `public/logo-mark.svg`)
  rendered inline via `BrandMark` component — zero network requests.
- Full **browser icon set**: `src/app/icon.svg`, `icon.png` (32), `apple-icon.png`
  (180), PWA icons 192/512 + `manifest.webmanifest` (`src/app/manifest.ts`).
  Regenerate PNGs after editing the SVG: `bun scripts/gen-icons.mjs`.
- **Themes**: Light / Dark / System (TopBar toggle + sidebar menu +
  Settings) and four **accent palettes** (amber, emerald, violet, rose) that
  retint buttons, focus rings and charts. Accent is saved per browser.

## Architecture notes

- **Single route `/`** — the portal is one SPA (`src/components/portal/*`) with
  client-side view switching; backend = Next.js route handlers under
  `src/app/api/**`.
- **Auth** — custom sessions (httpOnly cookie `pos_session`, 30 days),
  scrypt password hashing (`src/lib/auth.ts`). Set `COOKIE_SECURE=true` when
  serving over HTTPS.
- **DB** — SQLite via Prisma at `db/custom.db`. Back it up like any file.
- **Workflow engine** — all status changes flow through
  `src/lib/workflow.ts` (validates the org's workflow graph, writes audit
  activity, fires notifications + emails).
- **Email engine** — `src/lib/mailer.ts` (transport, preferences, delivery,
  claim/reset tokens) + `src/lib/email-templates.ts` (responsive HTML
  templates with plain-text alternates). Delivery is fire-and-forget and never
  blocks request paths; every attempt is logged to `EmailLog` with
  `SENT` / `FAILED` / `SIMULATED`.
- **Digest scheduler** — `mini-services/digest-cron` calls
  `POST /api/digest/cron` (shared secret `DIGEST_CRON_SECRET`) daily at 09:00
  Asia/Karachi.

## Production checklist

- [ ] `APP_URL` set to the public URL (used in every email link)
- [ ] SMTP credentials in `.env` + `Settings → Send test email` passes
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] `bun run build && bun run start` (standalone output)
- [ ] Schedule the digest mini-service (`mini-services/digest-cron`)
- [ ] Backup `db/custom.db` (plus `db/uploads/` for attachments)
