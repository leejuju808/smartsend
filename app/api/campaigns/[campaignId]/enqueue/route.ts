// app/api/campaigns/[campaignId]/enqueue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";
import { personalizeIfEnabled } from "@/lib/ai/personalization-helpers";

type SequenceStep = {
  subject: string;
  body: string;
  delay: number; // days from previous step
};

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const campaignId = params.campaignId;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // 1) Load campaign (must belong to user)
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, owner_id, status, sequence, workspace_id")
    .eq("id", campaignId)
    .eq("owner_id", user.id)
    .single();

  if (campError || !campaign) {
    console.error("Campaign not found:", campError);
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (!campaign.sequence || !Array.isArray(campaign.sequence)) {
    return NextResponse.json(
      { error: "Campaign has no sequence defined" },
      { status: 400 }
    );
  }

  const sequence = campaign.sequence as SequenceStep[];

  if (!sequence.length) {
    return NextResponse.json(
      { error: "Campaign sequence is empty" },
      { status: 400 }
    );
  }

  // 2) Load leads on this campaign
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, email, status")
    .eq("campaign_id", campaignId)
    .in("status", ["open", "in_progress"]);

  if (leadsError) {
    console.error("Error loading leads for campaign:", leadsError);
    return NextResponse.json(
      { error: "Failed to load leads" },
      { status: 500 }
    );
  }

  if (!leads || !leads.length) {
    return NextResponse.json(
      { error: "No eligible leads found for this campaign" },
      { status: 400 }
    );
  }

  // Filter out suppressed emails
  const leadEmails = Array.from(
    new Set(
      (leads ?? [])
        .map((l) => l.email?.toLowerCase().trim())
        .filter(Boolean) as string[]
    )
  );

  const { data: suppressedRows } = await supabase
    .from("suppression_list_global")
    .select("email")
    .in("email", leadEmails);

  const suppressedSet = new Set(
    (suppressedRows ?? []).map((r) => r.email.toLowerCase().trim())
  );

  const eligibleLeads = (leads ?? []).filter((l) => {
    const e = l.email?.toLowerCase().trim();
    return e && !suppressedSet.has(e);
  });

  if (!eligibleLeads.length) {
    return NextResponse.json(
      { error: "No eligible leads found after filtering suppressed emails" },
      { status: 400 }
    );
  }

  // 3) Check existing scheduled emails to avoid duplicates
  const leadIds = eligibleLeads.map((l) => l.id);

  const { data: existingEmails, error: existingError } = await supabase
    .from("outbound_emails")
    .select("lead_id, step_index")
    .eq("campaign_id", campaignId)
    .in("lead_id", leadIds);

  if (existingError) {
    console.error("Error checking existing emails:", existingError);
    return NextResponse.json(
      { error: "Failed to check existing queue" },
      { status: 500 }
    );
  }

  const existingMap = new Set(
    (existingEmails ?? []).map(
      (e) => `${e.lead_id}:${e.step_index ?? 0}`
    )
  );

  // 4) Build new queue entries with AI Personalization (Block 9400)
  const now = new Date();

  const emailsToInsert: any[] = [];

  for (const lead of eligibleLeads) {
    let cumulativeDelayDays = 0;

    for (let index = 0; index < sequence.length; index++) {
      const step = sequence[index];
      const key = `${lead.id}:${index}`;
      if (existingMap.has(key)) {
        // Already scheduled/sent for this lead & step
        cumulativeDelayDays += step.delay || 0;
        continue;
      }

      const scheduled = new Date(now);
      scheduled.setDate(scheduled.getDate() + cumulativeDelayDays);

      // Block 9400: Personalize email if enabled (Growth/Domination plans)
      let finalSubject = step.subject;
      let finalBody = step.body;
      
      if (campaign.workspace_id) {
        try {
          // Personalize email (engine handles both contacts and leads)
          const personalized = await personalizeIfEnabled(
            step.subject,
            step.body,
            lead.id, // Can be contact_id or lead_id
            campaignId,
            campaign.workspace_id
          );
          
          // Only use personalized version if personalization succeeded
          if (personalized.personalized) {
            finalSubject = personalized.subject;
            finalBody = personalized.body;
          }
        } catch (error) {
          console.error('Personalization error for lead', lead.id, error);
          // Continue with original template on error
        }
      }

      // Build email entry with all required and optional fields
      const emailEntry: any = {
        owner_id: user.id, // 👈 add this - ties email to the account that owns it
        campaign_id: campaignId,
        lead_id: lead.id,
        to_email: lead.email,
        subject: finalSubject,
        body_text: finalBody,
        body: finalBody, // Also set body for compatibility
        step_index: index,
        scheduled_at: scheduled.toISOString(),
        send_at: scheduled.toISOString(), // Also set send_at for compatibility
        status: "pending",
      };

      // Add workspace_id if available
      if (campaign.workspace_id) {
        emailEntry.workspace_id = campaign.workspace_id;
      }

      emailsToInsert.push(emailEntry);

      cumulativeDelayDays += step.delay || 0;
    }
  }

  if (!emailsToInsert.length) {
    return NextResponse.json(
      { message: "No new emails to enqueue" },
      { status: 200 }
    );
  }

  // 5) Insert into outbound_emails
  const { error: insertError } = await supabase
    .from("outbound_emails")
    .insert(emailsToInsert);

  if (insertError) {
    console.error("Error enqueuing emails:", insertError);
    return NextResponse.json(
      { error: "Failed to enqueue emails" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      enqueued_count: emailsToInsert.length,
      leads_count: leads.length,
    },
    { status: 201 }
  );
}

