import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { handle, optStrArr, parseBody, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Mark notifications as read. `{ids?: string[]}` — empty/missing ids marks ALL. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const body = await parseBody(req);
    const ids = optStrArr(body, "ids");
    const where = { orgId: session.org.id, userId: session.user.id };

    if (ids && ids.length > 0) {
      await db.notification.updateMany({
        where: { ...where, id: { in: ids } },
        data: { read: true },
      });
    } else {
      await db.notification.updateMany({
        where: { ...where, read: false },
        data: { read: true },
      });
    }

    return NextResponse.json({});
  });
}
