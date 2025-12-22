// app/api/leads/batch/delete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  // Admin/Owner only
  const gate = await requireRole(["owner", "admin"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const { ids } = await req.json();

  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  await supabase.from("leads").delete().in("id", ids);

  return NextResponse.json({ ok: true });
}

