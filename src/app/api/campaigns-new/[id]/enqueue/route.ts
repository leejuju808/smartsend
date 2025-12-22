import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { leadIds, subject, body, startAt } = await req.json();
  if (!Array.isArray(leadIds) || !leadIds.length) {
    return NextResponse.json({ error: "no leads" }, { status: 400 });
  }

  // resolve org_id from campaign
  const { data: camp, error } = await supabase
    .from("campaigns").select("id, org_id").eq("id", params.id).single();
  
  if (error || !camp) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  // fetch leads' emails
  const { data: leads } = await supabase
    .from("leads")
    .select("id, email")
    .in("id", leadIds);

  if (!leads || !leads.length) {
    return NextResponse.json({ error: "no leads found" }, { status: 404 });
  }

  const rows = (leads ?? []).map(l => {
    // Append SmartSend tracking token to subject
    const token = `[SS|${l.id}]`;
    const subjectWithToken = `${subject} ${token}`;
    
    return {
      org_id: camp.org_id,
      campaign_id: camp.id,
      lead_id: l.id,
      to_email: l.email,
      subject: subjectWithToken,
      body,
      schedule_at: startAt ? new Date(startAt).toISOString() : new Date().toISOString(),
      idempotency_key: `${camp.id}:${l.id}:${subject.slice(0, 40)}`
    };
  });

  const { error: insErr } = await supabase.from("send_queue").insert(rows);
  
  // Store subject tokens in campaign_leads for audit trail
  if (!insErr) {
    for (const lead of leads) {
      await supabase
        .from("campaign_leads")
        .upsert({
          campaign_id: camp.id,
          lead_id: lead.id,
          subject_token: `[SS|${lead.id}]`
        }, {
          onConflict: "campaign_id,lead_id",
          ignoreDuplicates: false
        });
    }
  }
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, queued: rows.length });
}

