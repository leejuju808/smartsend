import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { from_step = 1, limit = 500 } = await req.json() || {};
  const { data, error } = await sb.rpc("schedule_followups_for_campaign", {
    p_campaign: params.id, p_from_step: from_step, p_limit: limit
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, queued: data ?? 0, from_step });
}



