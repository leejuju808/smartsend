import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST { workspaceId, campaignId, messages: [{leadId, to, subject, body, scheduledAt?}] }
export async function POST(req: Request) {
  try {
    const { workspaceId, campaignId, messages } = await req.json();

    // Load campaign to get org_id
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id, org_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campErr || !campaign) {
      console.error("launch: campaign lookup failed");
    }

    const orgId = campaign?.org_id ?? null;

    // Load suppression list for org
    const { data: suppressed } = await supabase
      .from("global_suppressions")
      .select("email_normalized")
      .eq("org_id", orgId);

    const suppressedSet = new Set(
      (suppressed || []).map((s: any) => s.email_normalized)
    );

    // Block 17800: Check bad leads before filtering
    let badLeadEmails = new Set<string>();
    if (workspaceId && messages.length > 0) {
      try {
        const leadIds = messages.map((m: any) => m.leadId).filter(Boolean);
        if (leadIds.length > 0) {
          const { data: cleanupResult } = await supabase.rpc(
            "cleanup_bad_leads_before_send",
            {
              p_workspace_id: workspaceId,
              p_lead_ids: leadIds,
            }
          );

          if (cleanupResult?.cleaned_lead_ids) {
            // Get emails for cleaned leads
            const { data: cleanedLeads } = await supabase
              .from("leads")
              .select("email")
              .in("id", leadIds.filter((id: string) => !cleanupResult.cleaned_lead_ids.includes(id)));
            
            // Get emails for bad leads
            const badLeadIds = leadIds.filter((id: string) => !cleanupResult.cleaned_lead_ids.includes(id));
            if (badLeadIds.length > 0) {
              const { data: badLeads } = await supabase
                .from("leads")
                .select("email")
                .in("id", badLeadIds);
              
              badLeadEmails = new Set((badLeads || []).map((l: any) => l.email?.toLowerCase()).filter(Boolean));
            }
          }
        }
      } catch (cleanupErr: any) {
        console.error("Bad lead cleanup error:", cleanupErr);
        // Don't block sending on cleanup errors
      }
    }

    // Filter out suppressed emails and bad leads before inserting
    const rows = (messages as any[])
      .filter((m) => {
        const emailNormalized = m.to?.toLowerCase().trim();
        return (
          emailNormalized && 
          !suppressedSet.has(emailNormalized) &&
          !badLeadEmails.has(emailNormalized)
        );
      })
      .map((m) => ({
        workspace_id: workspaceId,
        campaign_id: campaignId,
        lead_id: m.leadId,
        to_email: m.to,
        subject: m.subject,
        body: m.body,
        status: m.scheduledAt ? "scheduled" : "queued",
        scheduled_at: m.scheduledAt ?? null,
        provider: "gmail",
      }));

    const { error } = await supabase.from("campaign_send_queue").insert(rows);
    if (error) throw error;

    return NextResponse.json({ ok: true, queued: rows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
