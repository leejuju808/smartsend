import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const {
      provider, // "gmail", "outlook", "postmark", etc.
      provider_message_id, // original outbound message this is replying to
      from_email,
      from_name,
      subject,
      text_body,
      html_body,
      thread_id,
      received_at,
    } = payload;

    // Validate required fields
    if (!provider_message_id || !from_email) {
      return NextResponse.json(
        { error: "provider_message_id and from_email are required" },
        { status: 400 }
      );
    }

    // 1) Find matching outbound event
    const { data: ev, error: lookupError } = await supabase
      .from("email_events")
      .select("id, lead_id, campaign_id, step_id")
      .eq("provider_message_id", provider_message_id)
      .eq("direction", "outbound")
      .limit(1)
      .single();

    if (lookupError || !ev) {
      return NextResponse.json(
        { error: "no_matching_outbound_event" },
        { status: 404 }
      );
    }

    const leadId = ev.lead_id;
    const campaignId = ev.campaign_id;
    const stepId = ev.step_id;

    if (!leadId || !campaignId) {
      return NextResponse.json(
        { error: "outbound_event_missing_lead_or_campaign" },
        { status: 400 }
      );
    }

    // 2) Insert inbound event
    const { data: inbound, error: insertError } = await supabase
      .from("email_events")
      .insert({
        lead_id: leadId,
        campaign_id: campaignId,
        step_id: stepId,
        event_type: "reply",
        direction: "inbound",
        provider_message_id,
        provider_thread_id: thread_id || null,
        from_address: from_email,
        to_address: null, // Will be populated from outbound event if needed
        subject: subject || null,
        body_text: text_body || null,
        body_html: html_body || null,
        raw_payload: payload,
        created_at: received_at ? new Date(received_at).toISOString() : new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert inbound event:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // 3) Find campaign_lead_id for linking
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select("id")
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .limit(1)
      .maybeSingle();

    const campaignLeadId = campaignLead?.id || null;

    // 4) Mark campaign lead as replied
    const { error: updateError } = await supabase
      .from("campaign_leads")
      .update({
        replied_at: new Date().toISOString(),
        last_reply_reason: "uncategorized",
        is_replied: true,
      })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId);

    if (updateError) {
      console.error("Failed to update campaign_lead:", updateError);
      // Don't fail the request, but log the error
    }

    // 5) Add to lead timeline
    const { error: activityError } = await supabase
      .from("lead_activity")
      .insert({
        lead_id: leadId,
        campaign_lead_id: campaignLeadId,
        activity_type: "reply_received",
        activity_data: {
          subject: subject || null,
          from_email,
          from_name: from_name || null,
          provider,
          event_id: inbound.id,
        },
      });

    if (activityError) {
      console.error("Failed to insert lead activity:", activityError);
      // Don't fail the request, but log the error
    }

    // 6) Optional: Trigger reply classification (Block 103 Integration)
    // Call reply-brain function asynchronously
    if (text_body || html_body) {
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-brain-v2`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              campaign_id: campaignId,
              reply_text: text_body || html_body || "",
            }),
          }
        );
      } catch (classificationError) {
        console.error("Failed to trigger reply classification:", classificationError);
        // Don't fail the request if classification fails
      }
    }

    return NextResponse.json({
      success: true,
      inbound: {
        id: inbound.id,
        lead_id: leadId,
        campaign_id: campaignId,
        event_type: "reply",
        direction: "inbound",
      },
    });
  } catch (error: any) {
    console.error("Error processing inbound reply:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

