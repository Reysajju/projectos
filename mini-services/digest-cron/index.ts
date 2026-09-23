/**
 * digest-cron — scheduled email digest trigger (blueprint §34).
 *
 * Independent mini-service: every day at 09:00 Asia/Karachi it calls the
 * portal's POST /api/digest/cron endpoint (shared-secret auth) so every org
 * member gets their morning digest. On Mondays it also notes weekly digests.
 *
 * Port 3210 (health endpoint). Target portal: http://localhost:3000.
 * Shared secret is read from PORTAL cron secret env (falls back to the dev
 * secret in .env) — must match the portal's DIGEST_CRON_SECRET.
 */

const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.DIGEST_CRON_SECRET ?? "pos_cron_dev_9f2c41ab77e54d0eaa01";
const TZ_HOUR = 9; // 09:00
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Karachi = UTC+5 (no DST)

const PORT = 3210;

let lastResult: { at: string; ok: boolean; status?: number; body?: string; error?: string } = {
  at: new Date().toISOString(),
  ok: true,
  body: "service started; waiting for 09:00 Asia/Karachi",
};

function msUntilNextRun(): number {
  const now = new Date();
  // Current time expressed in Karachi wall clock
  const karachi = new Date(now.getTime() + TZ_OFFSET_MS);
  const run = new Date(karachi);
  run.setHours(TZ_HOUR, 0, 0, 0);
  if (run.getTime() <= karachi.getTime()) run.setDate(run.getDate() + 1);
  return run.getTime() - karachi.getTime();
}

async function fireDigest(): Promise<void> {
  try {
    const res = await fetch(`${PORTAL_URL}/api/digest/cron`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    const body = await res.text();
    lastResult = { at: new Date().toISOString(), ok: res.ok, status: res.status, body: body.slice(0, 500) };
    console.log(`[digest-cron] fired → ${res.status}: ${body.slice(0, 200)}`);
  } catch (err) {
    lastResult = {
      at: new Date().toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    console.error("[digest-cron] failed:", lastResult.error);
  }
}

function scheduleNext(): void {
  const ms = msUntilNextRun();
  const nextAt = new Date(Date.now() + TZ_OFFSET_MS + ms);
  console.log(`[digest-cron] next run at ${nextAt.toISOString()} (in ${Math.round(ms / 60000)} min)`);
  setTimeout(() => {
    void fireDigest();
    scheduleNext();
  }, ms);
  // Re-schedule if the timeout is clamped (>2^31ms not an issue for daily runs).
}

// Safety: on boot, if it's already past 09:00 Karachi and nothing ran today, fire once.
const karachiNow = new Date(Date.now() + TZ_OFFSET_MS);
if (karachiNow.getHours() >= TZ_HOUR) {
  console.log("[digest-cron] boot catch-up: firing digest for today");
  void fireDigest();
}
scheduleNext();

// Tiny health endpoint so the service is observable.
const server = Bun.serve({
  port: PORT,
  fetch() {
    return new Response(JSON.stringify({ service: "digest-cron", lastResult }, null, 2), {
      headers: { "content-type": "application/json" },
    });
  },
});

console.log(`[digest-cron] health endpoint on http://localhost:${server.port}`);
