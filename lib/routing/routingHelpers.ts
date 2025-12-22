// lib/routing/routingHelpers.ts
// Block 9600 — Smart Routing v1: Shared routing logic

import { createClient } from "@/lib/supabase/server";
import { sendHotLeadAlert, sendWarmLeadAlert } from "./emailNotifications";
import {
  sendOwnerSMS,
  buildHotLeadSMS,
  buildWarmLeadSMS,
} from "@/lib/sms/ownerNotifications";

/**
 * Process hot lead routing
 */
export async function processHotLeadRouting(params: {
  accountId: string;
  campaignId: string;
  contactId: string;
  messageId?: string | null;
  summary?: string | null;
  nextAction?: string | null;
  replyText?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const {
    accountId,
    campaignId,
    contactId,
    messageId,
    summary,
    nextAction,
    replyText,
  } = params;

  try {
    // Call database function to handle routing
    const { data: routingResult, error: routingError } = await supabase.rpc(
      "handle_hot_lead_routing",
      {
        p_account_id: accountId,
        p_campaign_id: campaignId,
        p_contact_id: contactId,
        p_message_id: messageId || null,
        p_summary: summary || null,
        p_next_action: nextAction || null,
      }
    );

    if (routingError) {
      console.error("Routing function error:", routingError);
      return { success: false, error: routingError.message };
    }

    // Get contact info for email
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, city")
      .eq("id", contactId)
      .single();

    if (!contactError && contact) {
      // Build lead URL
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
      const leadUrl = `${baseUrl}/contacts/${contactId}`;

      // Send email alert (don't fail if email fails)
      await sendHotLeadAlert({
        accountId,
        contact: {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          city: contact.city,
        },
        summary: summary || null,
        nextAction: nextAction || null,
        replyText: replyText || null,
        leadUrl,
      }).catch((err) => {
        console.error("Failed to send hot lead alert email:", err);
      });

      // Send SMS alert (Block 9700) - don't fail if SMS fails
      const homeownerName = contact.first_name
        ? `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
        : null;
      const smsBody = buildHotLeadSMS({
        homeownerName,
        city: contact.city,
        summary: summary || null,
        nextAction: nextAction || null,
      });

      // Get routing event ID for logging
      const { data: routingEvent } = await supabase
        .from("routing_events")
        .select("id")
        .eq("account_id", accountId)
        .eq("campaign_id", campaignId)
        .eq("contact_id", contactId)
        .eq("type", "hot_alert")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await sendOwnerSMS({
        accountId,
        body: smsBody,
        metadata: {
          contactId,
          campaignId,
          routingEventId: routingEvent?.id,
        },
        smsType: "hot_lead",
      }).catch((err) => {
        console.error("Failed to send hot lead SMS:", err);
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Hot lead routing error:", error);
    return { success: false, error: error.message || "Routing failed" };
  }
}

/**
 * Process warm lead routing
 */
export async function processWarmLeadRouting(params: {
  accountId: string;
  campaignId: string;
  contactId: string;
  messageId?: string | null;
  summary?: string | null;
  nextAction?: string | null;
  replyText?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const {
    accountId,
    campaignId,
    contactId,
    messageId,
    summary,
    nextAction,
    replyText,
  } = params;

  try {
    // Call database function to handle routing
    const { data: routingResult, error: routingError } = await supabase.rpc(
      "handle_warm_lead_routing",
      {
        p_account_id: accountId,
        p_campaign_id: campaignId,
        p_contact_id: contactId,
        p_message_id: messageId || null,
        p_summary: summary || null,
        p_next_action: nextAction || null,
      }
    );

    if (routingError) {
      console.error("Routing function error:", routingError);
      return { success: false, error: routingError.message };
    }

    // Get contact info for email
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, city")
      .eq("id", contactId)
      .single();

    if (!contactError && contact) {
      // Build lead URL
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
      const leadUrl = `${baseUrl}/contacts/${contactId}`;

      // Send email alert (don't fail if email fails)
      await sendWarmLeadAlert({
        accountId,
        contact: {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          city: contact.city,
        },
        summary: summary || null,
        nextAction: nextAction || null,
        replyText: replyText || null,
        leadUrl,
      }).catch((err) => {
        console.error("Failed to send warm lead alert email:", err);
      });

      // Send SMS alert (Block 9700) - don't fail if SMS fails
      const homeownerName = contact.first_name
        ? `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
        : null;
      const smsBody = buildWarmLeadSMS({
        homeownerName,
        city: contact.city,
        summary: summary || null,
        nextAction: nextAction || null,
      });

      // Get routing event ID for logging
      const { data: routingEvent } = await supabase
        .from("routing_events")
        .select("id")
        .eq("account_id", accountId)
        .eq("campaign_id", campaignId)
        .eq("contact_id", contactId)
        .eq("type", "warm_alert")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await sendOwnerSMS({
        accountId,
        body: smsBody,
        metadata: {
          contactId,
          campaignId,
          routingEventId: routingEvent?.id,
        },
        smsType: "warm_lead",
      }).catch((err) => {
        console.error("Failed to send warm lead SMS:", err);
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Warm lead routing error:", error);
    return { success: false, error: error.message || "Routing failed" };
  }
}

