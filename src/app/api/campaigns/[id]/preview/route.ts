import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { step_no = 1, lead_id } = await req.json() || {};
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const { data, error } = await sb.rpc("compose_email_by_step", {
    p_campaign: params.id,
    p_lead: lead_id,
    p_step: step_no
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    to: row?.to_email ?? "",
    subject: row?.subject ?? "",
    html: row?.html ?? ""
  });
}

