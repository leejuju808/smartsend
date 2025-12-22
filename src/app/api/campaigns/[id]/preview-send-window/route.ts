import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { lead_id, step_no, include_jitter = false, base } = await req.json() || {};
  if (!lead_id || !step_no) {
    return NextResponse.json({ error: "lead_id and step_no required" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("preview_next_send_for_step", {
    p_campaign: params.id,
    p_lead: lead_id,
    p_step_no: step_no,
    p_base: base || new Date().toISOString(),
    p_include_jitter: !!include_jitter,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const preview = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, preview });
}

