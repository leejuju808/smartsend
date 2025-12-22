// Block 254300 — SmartSend Sales Acceleration Engine v1
// Follow-Up Automation for Sales Leads
// POST /api/sales/followups/automate

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

interface FollowUpAutomationRequest {
  org_id: string;
  lead_id: string;
  sequence_type?: "quote_followup" | "proposal_followup" | "general_followup";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: FollowUpAutomationRequest = await req.json();
    const { org_id, lead_id, sequence_type = "quote_followup" } = body;

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get last activity date
    const { data: lastActivity } = await supabase
      .from("sales_activities")
      .select("created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastContactDate = lastActivity?.created_at
      ? new Date(lastActivity.created_at)
      : lead.created_at
      ? new Date(lead.created_at)
      : new Date();

    // Define follow-up sequences
    const sequences: Record<string, Array<{ day_offset: number; subject: string; body: string }>> = {
      quote_followup: [
        {
          day_offset: 1,
          subject: "Your quote is ready",
          body: `Hey ${lead.first_name || "there"},

Just checking in — your quote is ready. Let me know if you had any questions about the proposal.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
        {
          day_offset: 3,
          subject: "Questions about your roofing quote?",
          body: `Hey ${lead.first_name || "there"},

Let me know if you had any questions about the proposal. I'm here to help!

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
        {
          day_offset: 7,
          subject: "Roofing season is busy — want to secure your spot?",
          body: `Hey ${lead.first_name || "there"},

Roofing season is getting busy. Want to secure your spot on our schedule? Let me know if you're ready to move forward.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
      ],
      proposal_followup: [
        {
          day_offset: 1,
          subject: "Proposal sent — next steps",
          body: `Hey ${lead.first_name || "there"},

I just sent over the proposal. Take a look and let me know if you have any questions.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
        {
          day_offset: 4,
          subject: "Following up on the proposal",
          body: `Hey ${lead.first_name || "there"},

Just following up on the proposal. Happy to answer any questions or discuss next steps.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
      ],
      general_followup: [
        {
          day_offset: 3,
          subject: "Quick check-in",
          body: `Hey ${lead.first_name || "there"},

Just checking in to see if you had any questions or if we can help with anything.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
        {
          day_offset: 7,
          subject: "Still interested?",
          body: `Hey ${lead.first_name || "there"},

Wanted to follow up and see if you're still interested in moving forward.

Best,
${user.user_metadata?.name || "Your Team"}`,
        },
      ],
    };

    const sequence = sequences[sequence_type] || sequences.general_followup;

    // Schedule follow-ups
    const scheduledFollowups = [];
    for (const step of sequence) {
      const scheduledFor = new Date(lastContactDate);
      scheduledFor.setDate(scheduledFor.getDate() + step.day_offset);
      scheduledFor.setHours(9, 0, 0, 0); // 9 AM

      const { data: followup, error: followupError } = await supabase
        .from("sales_followups")
        .insert({
          org_id,
          lead_id,
          sequence_step: step.day_offset,
          day_offset: step.day_offset,
          scheduled_for: scheduledFor.toISOString(),
          subject: step.subject,
          body_text: step.body,
          status: "scheduled",
        })
        .select()
        .single();

      if (!followupError) {
        scheduledFollowups.push(followup);
      }
    }

    return NextResponse.json({
      success: true,
      followups_scheduled: scheduledFollowups.length,
      followups: scheduledFollowups,
    });
  } catch (error: any) {
    console.error("Error in follow-up automation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















