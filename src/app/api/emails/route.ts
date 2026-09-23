import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Emails older than this are pruned by DELETE /api/emails and by the cron run. */
const RETENTION_DAYS = 30;

/** GET /api/emails — recent outbox (ADMIN/MANAGER). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) {
      return NextResponse.json({ error: "Only admins and managers can view the outbox" }, { status: 403 });
    }

    const [logs, total] = await Promise.all([
      db.emailLog.findMany({
        where: { orgId: session.org.id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.emailLog.count({ where: { orgId: session.org.id } }),
    ]);

    return NextResponse.json({
      total,
      retentionDays: RETENTION_DAYS,
      emails: logs.map((l) => ({
        id: l.id,
        kind: l.kind,
        toEmail: l.toEmail,
        toName: l.user?.name ?? null,
        subject: l.subject,
        status: l.status,
        trigger: (() => {
          try {
            return l.meta ? (JSON.parse(l.meta) as { trigger?: string }).trigger ?? null : null;
          } catch {
            return null;
          }
        })(),
        createdAt: l.createdAt.toISOString(),
      })),
    });
  });
}

/** DELETE /api/emails — prune outbox rows older than the retention window (ADMIN/MANAGER). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) {
      return NextResponse.json({ error: "Only admins and managers can prune the outbox" }, { status: 403 });
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
    const deleted = await db.emailLog.deleteMany({
      where: { orgId: session.org.id, createdAt: { lt: cutoff } },
    });

    return NextResponse.json({ deleted: deleted.count, retentionDays: RETENTION_DAYS });
  });
}
