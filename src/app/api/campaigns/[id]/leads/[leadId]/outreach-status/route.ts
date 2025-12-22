import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set(["uncontacted", "contacted", "warm", "hot", "dead", "closed"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; leadId: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nextStatus = String(body?.status || "").toLowerCase().trim();
  if (!ALLOWED.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Load current lead + ensure campaign match
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id,campaign_id,outreach_status,reason_dead,email")
    .eq("id", params.leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: leadErr?.message || "Lead not found" }, { status: 404 });
  }

  const campaignId = lead.campaign_id || params.id;
  if (lead.campaign_id && String(lead.campaign_id) !== String(params.id)) {
    return NextResponse.json({ error: "Lead not in this campaign" }, { status: 400 });
  }

  const prev = lead.outreach_status || null;
  const updates: any = {
    outreach_status: nextStatus,
    reason_dead: nextStatus === "dead" ? String(body?.reason || "manual_override") : null,
  };

  const { error: updErr } = await supabase.from("leads").update(updates).eq("id", lead.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // Append lead-level audit (preferred; schema is stable)
  await supabase
    .from("lead_audit_logs")
    .insert({
      lead_id: lead.id,
      event_type: "user_status_change",
      actor_type: "user",
      actor_id: user.id,
      event_data: {
        field: "outreach_status",
        from: prev,
        to: nextStatus,
        reason: updates.reason_dead,
        campaign_id: campaignId,
      },
    } as any)
    .catch(() => {});

  // Best-effort generic audit_logs entry (schema differs across environments)
  await supabase
    .from("audit_logs")
    .insert({
      campaign_id: campaignId,
      action: "lead.outreach_status_override",
      meta: {
        lead_id: lead.id,
        email: lead.email,
        from: prev,
        to: nextStatus,
        reason: updates.reason_dead,
      },
    } as any)
    .catch(() => {});

  return NextResponse.json({ ok: true, from: prev, to: nextStatus });
}









