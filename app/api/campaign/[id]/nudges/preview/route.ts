import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const campaignId = params.id;
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "campaign_required" }, { status: 400 });
  }

  const { leadId, subject, body } = await req.json();

  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing leadId" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("render_nudge", {
    p_campaign: campaignId,
    p_lead: leadId,
    p_subject: subject ?? "",
    p_body: body ?? "",
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ok: true,
    subject: row?.subject ?? subject,
    body: row?.body ?? body,
  });
}


