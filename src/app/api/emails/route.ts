import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** GET /api/emails — recent outbox (ADMIN/MANAGER). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) {
      return NextResponse.json({ error: "Only admins and managers can view the outbox" }, { status: 403 });
    }

    const logs = await db.emailLog.findMany({
      where: { orgId: session.org.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
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
