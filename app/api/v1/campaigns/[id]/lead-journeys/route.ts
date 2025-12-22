// GET /v1/campaigns/{id}/lead-journeys - Lead Journeys
// Block 11300 — Campaign Performance Dashboard v2
// Returns contact-level journey data showing step progression and outcomes

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/").slice(-2)[0];
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (campaignError || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  // Try to use lead_journey_view if available
  const { data: journeyData } = await supabase
    .from("lead_journey_view")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("contact_id", { ascending: true })
    .order("step_no", { ascending: true });

  if (journeyData && journeyData.length > 0) {
    // Group by contact
    const journeysByContact = new Map<string, any[]>();
    
    journeyData.forEach((row: any) => {
      if (!journeysByContact.has(row.contact_id)) {
        journeysByContact.set(row.contact_id, []);
      }
      journeysByContact.get(row.contact_id)!.push(row);
    });

    const journeys = Array.from(journeysByContact.entries()).map(([contactId, steps]) => {
      const firstStep = steps[0];
      const lastStep = steps[steps.length - 1];
      
      // Determine outcome
      let outcome = "No Reply";
      if (firstStep.is_customer) {
        outcome = "Customer";
      } else if (firstStep.estimate_booked) {
        outcome = "Estimate Booked";
      } else if (firstStep.latest_intent === "hot") {
        outcome = "Hot Lead";
      } else if (firstStep.latest_intent === "warm") {
        outcome = "Warm Lead";
      } else if (firstStep.replied_at) {
        outcome = "Replied";
      }

      return {
        contactId: contactId,
        name: `${firstStep.first_name || ""} ${firstStep.last_name || ""}`.trim() || "Unknown",
        email: firstStep.email || "",
        stepReplied: firstStep.reply_step_id ? firstStep.step_no : null,
        intent: firstStep.latest_intent || "unclassified",
        status: firstStep.outcome_status || outcome,
        outcome: outcome,
        revenue: firstStep.is_customer ? Number(firstStep.job_value || 0) : null,
        journey: steps.map((step: any) => ({
          stepNo: step.step_no || 1,
          stepName: `Step ${step.step_no || 1}`,
          status: step.step_status || "pending",
          sentAt: step.step_sent_at || null,
          repliedAt: step.replied_at || null,
        })),
      };
    });

    return NextResponse.json({
      data: journeys,
    });
  }

  // Fallback: manual query
  const { data: campaignMembers } = await supabase
    .from("campaign_members")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .limit(1000);

  const leadIds = campaignMembers?.map((cm) => cm.lead_id) || [];

  const journeys = await Promise.all(
    leadIds.slice(0, 500).map(async (contactId) => {
      // Get contact info
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, is_customer, estimate_booked, job_value")
        .eq("id", contactId)
        .single();

      if (!contact) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, email, first_name, last_name")
          .eq("id", contactId)
          .single();
        if (!lead) return null;

        return {
          contactId: lead.id,
          name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown",
          email: lead.email || "",
          stepReplied: null,
          intent: "unclassified",
          status: "No Reply",
          outcome: "No Reply",
          revenue: null,
          journey: [],
        };
      }

      // Get all steps sent to this contact
      const { data: sentSteps } = await supabase
        .from("send_queue")
        .select("step_no, status, sent_at, scheduled_at")
        .eq("campaign_id", campaignId)
        .eq("lead_id", contactId)
        .in("status", ["sent", "completed"])
        .order("step_no", { ascending: true });

      // Get reply info
      const { data: thread } = await supabase
        .from("reply_threads")
        .select("id, latest_intent, last_message_at, latest_message_id")
        .eq("campaign_id", campaignId)
        .eq("lead_id", contactId)
        .single();

      let replyStepNo: number | null = null;
      if (thread?.latest_message_id) {
        const { data: message } = await supabase
          .from("messages")
          .select("campaign_step_id")
          .eq("id", thread.latest_message_id)
          .single();

        if (message?.campaign_step_id) {
          const { data: campaignStep } = await supabase
            .from("campaign_steps")
            .select("step_no")
            .eq("id", message.campaign_step_id)
            .single();

          if (campaignStep) {
            replyStepNo = campaignStep.step_no;
          }
        }
      }

      // Determine outcome
      let outcome = "No Reply";
      if (contact.is_customer) {
        outcome = "Customer";
      } else if (contact.estimate_booked) {
        outcome = "Estimate Booked";
      } else if (thread?.latest_intent === "hot") {
        outcome = "Hot Lead";
      } else if (thread?.latest_intent === "warm") {
        outcome = "Warm Lead";
      } else if (thread) {
        outcome = "Replied";
      }

      const journey = (sentSteps || []).map((step) => ({
        stepNo: step.step_no || 1,
        stepName: `Step ${step.step_no || 1}`,
        status: step.status,
        sentAt: step.sent_at || step.scheduled_at || null,
        repliedAt: step.step_no === replyStepNo ? thread?.last_message_at || null : null,
      }));

      return {
        contactId: contact.id,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Unknown",
        email: contact.email || "",
        stepReplied: replyStepNo,
        intent: thread?.latest_intent || "unclassified",
        status: outcome,
        outcome: outcome,
        revenue: contact.is_customer ? Number(contact.job_value || 0) : null,
        journey: journey,
      };
    })
  );

  const validJourneys = journeys.filter((j) => j !== null);

  return NextResponse.json({
    data: validJourneys,
  });
});

