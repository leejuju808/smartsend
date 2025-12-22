// app/api/campaigns/[id]/queue/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const campaign_id = params.id;

  // 1) Load campaign
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, owner_id, sequence, status, workspace_id")
    .eq("id", campaign_id)
    .maybeSingle();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sequence = (campaign.sequence as any[]) || [];
  if (!sequence.length) {
    return NextResponse.json(
      { error: "This campaign has no sequence steps." },
      { status: 400 }
    );
  }

  // 2) Load leads
  const { data: leads, error: leadErr } = await supabase
    .from("leads")
    .select("id, email, first_name, last_name, name, status")
    .eq("campaign_id", campaign_id)
    .eq("status", "active");

  if (leadErr) {
    console.error("Lead load error:", leadErr);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }

  if (!leads || !leads.length) {
    return NextResponse.json(
      { error: "No active leads in this campaign." },
      { status: 400 }
    );
  }

  const now = new Date();
  const version = Math.floor(Date.now() / 1000); // sequence version

  const rows = [];

  for (const lead of leads) {
    let cumulativeDelayDays = 0;

    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];

      const scheduled = new Date(now);
      scheduled.setDate(scheduled.getDate() + cumulativeDelayDays);

      rows.push({
        owner_id: campaign.owner_id,
        campaign_id,
        lead_id: lead.id,
        step_index: i,
        sequence_version: version,
        to_email: lead.email,
        subject: step.subject,
        body_text: step.body,
        body: step.body, // Also set body for compatibility
        status: "pending",
        scheduled_at: scheduled.toISOString(),
        send_at: scheduled.toISOString(), // Also set send_at for compatibility
        // Make nullable fields optional
        workspace_id: campaign.workspace_id || null,
        campaign_contact_id: null,
        contact_id: null,
        step_id: null,
      });

      // Add delay for next step
      cumulativeDelayDays += step.delay || 0;
    }
  }

  // 3) Insert queue
  const { error: insertErr } = await supabase
    .from("outbound_emails")
    .insert(rows);

  if (insertErr) {
    console.error("Queue insert error:", insertErr);
    return NextResponse.json(
      { error: "Failed to queue campaign" },
      { status: 500 }
    );
  }

  // 4) Update campaign status
  await supabase
    .from("campaigns")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("id", campaign_id);

  // Mark campaign as queued in onboarding
  await supabase
    .from("profiles")
    .update({ onboarding_campaign_queued: true })
    .eq("id", user.id);

  return NextResponse.json(
    {
      queued: rows.length,
      leads: leads.length,
      steps_per_lead: sequence.length,
    },
    { status: 200 }
  );
}
