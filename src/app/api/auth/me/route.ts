import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toOrgDTO, toUserDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    return NextResponse.json({
      user: toUserDTO(session.user),
      org: toOrgDTO(session.org),
      role: session.role,
    });
  });
}
