// app/api/routing/warm-alert/route.ts
// Block 9600 — Smart Routing v1: Warm Lead Alert Endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWarmLeadAlert } from "@/lib/routing/emailNotifications";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();

    const {
      contact_id,
      campaign_id,
      message_id,
      intent = "warm",
      summary,
      next_action,
      reply_text,
    } = body as {
      contact_id: string;
      campaign_id: string;
      message_id?: string;
      intent?: string;
      summary?: string;
      next_action?: string;
      reply_text?: string;
    };

    if (!contact_id || !campaign_id) {
      return NextResponse.json(
        { error: "contact_id and campaign_id are required" },
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

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, city")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Call database function to handle routing
    const { data: routingResult, error: routingError } = await supabase.rpc(
      "handle_warm_lead_routing",
      {
        p_account_id: accountId,
        p_campaign_id: campaign_id,
        p_contact_id: contact_id,
        p_message_id: message_id || null,
        p_summary: summary || null,
        p_next_action: next_action || null,
      }
    );

    if (routingError) {
      console.error("Routing function error:", routingError);
      return NextResponse.json(
        { error: "Failed to process routing", details: routingError.message },
        { status: 500 }
      );
    }

    // Build lead URL
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
    const leadUrl = `${baseUrl}/contacts/${contact_id}`;

    // Send email alert
    const emailResult = await sendWarmLeadAlert({
      accountId,
      contact: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        city: contact.city,
      },
      summary: summary || null,
      nextAction: next_action || null,
      replyText: reply_text || null,
      leadUrl,
    });

    if (!emailResult.success) {
      console.error("Email alert failed:", emailResult.error);
      // Don't fail the request if email fails, but log it
    }

    return NextResponse.json({
      success: true,
      routing: routingResult,
      email_sent: emailResult.success,
    });
  } catch (error: any) {
    console.error("Warm alert endpoint error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























































