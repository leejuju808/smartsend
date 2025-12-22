// SmartSend — Compose v2 (Templates • Variables • Schedule)
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { renderTemplate } from "@/lib/templating";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, campaign_id, template } = body || {};

    if (!org_id || !campaign_id || !template?.subject || !template?.body) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // 1) fetch campaign leads + joined lead data for variables
    const { data: list, error: leadError } = await supabase
      .from("campaign_leads")
      .select("id, lead_id, leads!inner(first_name, last_name, company, title, phone, website, email)")
      .eq("campaign_id", campaign_id);

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 400 });
    }

    if (!list || list.length === 0) {
      return NextResponse.json({ error: "No leads found for campaign" }, { status: 400 });
    }

    // 2) render + build outbound_queue rows
    const rows: any[] = [];
    for (const r of list) {
      const lead = r.leads as any;
      const ctx = {
        first_name: lead?.first_name || "",
        last_name: lead?.last_name || "",
        company: lead?.company || "",
        title: lead?.title || "",
        phone: lead?.phone || "",
        website: lead?.website || "",
        email: lead?.email || "",
      };

      let subj = renderTemplate(template.subject, ctx);
      const html = renderTemplate(template.body, ctx);

      if (!subj || !html) continue;
      
      // Append SmartSend tracking token to subject
      const token = `[SS|${r.lead_id}]`;
      subj = `${subj} ${token}`;

      rows.push({
        org_id,
        campaign_id,
        lead_id: r.lead_id || null,
        to_email: lead?.email || "",
        subject: subj,
        body: html,
        connector: "gmail",
        status: "pending",
        scheduled_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid emails to queue" }, { status: 400 });
    }

    // 3) chunk and batch insert
    const chunk = (arr: any[], n: number) =>
      arr.reduce((acc: any[][], _, i) => (i % n ? acc : acc.concat([arr.slice(i, i + n)])), [] as any[][]);
    const batches = chunk(rows, 500);
    let enqueued = 0;

    for (const b of batches) {
      const { error: insertError } = await supabase.from("outbound_queue").insert(b);
      if (!insertError) enqueued += b.length;
    }
    
    // Store subject tokens in campaign_leads for audit trail (only if successfully enqueued)
    if (enqueued > 0) {
      for (const r of list) {
        if (r.lead_id) {
          await supabase
            .from("campaign_leads")
            .update({ subject_token: `[SS|${r.lead_id}]` })
            .eq("id", r.id);
        }
      }
    }

    return NextResponse.json({ enqueued, skipped: list.length - enqueued });
  } catch (error) {
    console.error("Error scheduling campaign:", error);
    return NextResponse.json(
      { error: "Failed to schedule campaign" },
      { status: 500 }
    );
  }
}

