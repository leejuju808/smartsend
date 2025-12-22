// app/api/leads/batch/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  const { ids, status } = await req.json();

  if (!Array.isArray(ids) || !status) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  await supabase
    .from("leads")
    .update({ status })
    .in("id", ids);

  return NextResponse.json({ ok: true });
}

