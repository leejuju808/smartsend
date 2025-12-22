// app/api/routing/manual-stage/route.ts
// Block 9600 — Smart Routing v1: Manual Stage Routing Endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendHotLeadAlert, sendWarmLeadAlert } from "@/lib/routing/emailNotifications";
import {
  sendOwnerSMS,
  buildEstimateScheduledSMS,
  buildJobWonSMS,
} from "@/lib/sms/ownerNotifications";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();

    const {
      contact_id,
      campaign_id,
      pipeline_stage,
    } = body as {
      contact_id: string;
      campaign_id: string;
      pipeline_stage: string;
    };

    if (!contact_id || !campaign_id || !pipeline_stage) {
      return NextResponse.json(
        { error: "contact_id, campaign_id, and pipeline_stage are required" },
        { status: 400 }
      );
    }

    // Validate pipeline_stage
    const validStages = [
      "new",
      "contacted",
      "estimate_scheduled",
      "estimate_sent",
      "follow_up",
      "won",
      "lost",
    ];
    if (!validStages.includes(pipeline_stage)) {
      return NextResponse.json(
        { error: `Invalid pipeline_stage. Must be one of: ${validStages.join(", ")}` },
        { status: 400 }
      );
    }

    // Get campaign to find account_id
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("account_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const accountId = campaign.account_id;
    if (!accountId) {
      return NextResponse.json(
        { error: "Campaign has no account_id" },
        { status: 400 }
      );
    }

    // Call database function to handle routing
    const { data: routingResult, error: routingError } = await supabase.rpc(
      "handle_manual_stage_routing",
      {
        p_account_id: accountId,
        p_campaign_id: campaign_id,
        p_contact_id: contact_id,
        p_pipeline_stage: pipeline_stage as any,
      }
    );

    if (routingError) {
      console.error("Routing function error:", routingError);
      return NextResponse.json(
        { error: "Failed to process routing", details: routingError.message },
        { status: 500 }
      );
    }

    // If stage is estimate_scheduled or won, send alert
    const shouldSendAlert =
      pipeline_stage === "estimate_scheduled" || pipeline_stage === "won";

    let emailResult = { success: false, error: undefined as string | undefined };
    let smsResult = { status: "skipped" as const };

    if (shouldSendAlert) {
      // Get contact info
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, city")
        .eq("id", contact_id)
        .single();

      if (!contactError && contact) {
        const baseUrl =
          process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
        const leadUrl = `${baseUrl}/contacts/${contact_id}`;

        // Use hot alert template for estimate_scheduled/won
        emailResult = await sendHotLeadAlert({
          accountId,
          contact: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            city: contact.city,
          },
          summary: `Pipeline stage updated to ${pipeline_stage}`,
          nextAction: pipeline_stage === "won" 
            ? "Job won! Follow up with customer to confirm details."
            : "Schedule estimate appointment.",
          replyText: null,
          leadUrl,
        });

        // Send SMS alert (Block 9700)
        const homeownerName = contact.first_name
          ? `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
          : null;

        // Get routing event ID for logging
        const { data: routingEvent } = await supabase
          .from("routing_events")
          .select("id")
          .eq("account_id", accountId)
          .eq("campaign_id", campaign_id)
          .eq("contact_id", contact_id)
          .eq("type", "manual_stage")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get estimated value for won jobs
        let estimatedValue: number | null = null;
        if (pipeline_stage === "won") {
          const { data: leadStats } = await supabase
            .from("lead_auto_follow_up_stats")
            .select("potential_job_value, closed_job_value")
            .eq("account_id", accountId)
            .eq("campaign_id", campaign_id)
            .eq("contact_id", contact_id)
            .maybeSingle();
          
          estimatedValue = leadStats?.closed_job_value || leadStats?.potential_job_value || null;
        }

        if (pipeline_stage === "estimate_scheduled") {
          const smsBody = buildEstimateScheduledSMS({
            homeownerName,
            city: contact.city,
          });

          smsResult = await sendOwnerSMS({
            accountId,
            body: smsBody,
            metadata: {
              contactId,
              campaignId: campaign_id,
              routingEventId: routingEvent?.id,
            },
            smsType: "estimate_scheduled",
          }).catch((err) => {
            console.error("Failed to send estimate scheduled SMS:", err);
            return { status: "failed" as const, error: err.message };
          });
        } else if (pipeline_stage === "won") {
          const smsBody = buildJobWonSMS({
            homeownerName,
            city: contact.city,
            estimatedValue,
          });

          smsResult = await sendOwnerSMS({
            accountId,
            body: smsBody,
            metadata: {
              contactId,
              campaignId: campaign_id,
              routingEventId: routingEvent?.id,
            },
            smsType: "won",
          }).catch((err) => {
            console.error("Failed to send job won SMS:", err);
            return { status: "failed" as const, error: err.message };
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      routing: routingResult,
      email_sent: emailResult.success,
      sms_sent: smsResult.status === "sent",
    });
  } catch (error: any) {
    console.error("Manual stage routing endpoint error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

