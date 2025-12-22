/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Marketing Analytics Aggregation
 * 
 * Functions for aggregating and calculating marketing campaign analytics
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Aggregate analytics for a campaign
 */
export async function aggregateCampaignAnalytics(
  workspaceId: string,
  campaignId: string,
  date: Date = new Date()
): Promise<void> {
  const supabase = createClient();

  const dateStr = date.toISOString().split("T")[0];

  // Get campaign recipients
  const { data: recipients } = await supabase
    .from("marketing_campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId);

  if (!recipients || recipients.length === 0) {
    return;
  }

  // Calculate metrics
  const metrics = {
    recipients: recipients.length,
    sent: recipients.filter((r) => ["sent", "opened", "clicked", "replied", "booked"].includes(r.status)).length,
    delivered: recipients.filter((r) => r.status !== "bounced").length,
    opened: recipients.filter((r) => r.opened_at).length,
    clicked: recipients.filter((r) => r.clicked_at).length,
    replied: recipients.filter((r) => r.replied_at).length,
    booked: recipients.filter((r) => r.booked_at).length,
    unsubscribed: recipients.filter((r) => r.unsubscribed_at).length,
    bounced: recipients.filter((r) => r.status === "bounced").length,
    revenue: recipients.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0),
  };

  // Calculate rates
  const openRate = metrics.sent > 0 ? (metrics.opened / metrics.sent) * 100 : 0;
  const clickRate = metrics.sent > 0 ? (metrics.clicked / metrics.sent) * 100 : 0;
  const replyRate = metrics.sent > 0 ? (metrics.replied / metrics.sent) * 100 : 0;
  const bookingRate = metrics.sent > 0 ? (metrics.booked / metrics.sent) * 100 : 0;
  const unsubscribeRate = metrics.sent > 0 ? (metrics.unsubscribed / metrics.sent) * 100 : 0;

  // Upsert analytics record
  await supabase
    .from("marketing_analytics")
    .upsert(
      {
        workspace_id: workspaceId,
        campaign_id: campaignId,
        date: dateStr,
        recipients: metrics.recipients,
        sent: metrics.sent,
        delivered: metrics.delivered,
        opened: metrics.opened,
        clicked: metrics.clicked,
        replied: metrics.replied,
        booked: metrics.booked,
        unsubscribed: metrics.unsubscribed,
        bounced: metrics.bounced,
        revenue: metrics.revenue,
        open_rate: openRate,
        click_rate: clickRate,
        reply_rate: replyRate,
        booking_rate: bookingRate,
        unsubscribe_rate: unsubscribeRate,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "workspace_id,campaign_id,date",
      }
    );

  // Update campaign totals
  await supabase
    .from("marketing_campaigns")
    .update({
      total_recipients: metrics.recipients,
      total_sent: metrics.sent,
      total_opens: metrics.opened,
      total_clicks: metrics.clicked,
      total_replies: metrics.replied,
      total_bookings: metrics.booked,
      total_revenue: metrics.revenue,
      total_unsubscribes: metrics.unsubscribed,
    })
    .eq("id", campaignId);
}

/**
 * Get campaign performance summary
 */
export async function getCampaignPerformanceSummary(
  workspaceId: string,
  campaignId: string
): Promise<any> {
  const supabase = createClient();

  // Get campaign
  const { data: campaign } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!campaign) {
    return null;
  }

  // Get analytics summary
  const { data: analytics } = await supabase
    .from("marketing_analytics")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("date", { ascending: false });

  // Calculate totals
  const summary = analytics?.reduce(
    (acc: any, day: any) => ({
      recipients: acc.recipients + (day.recipients || 0),
      sent: acc.sent + (day.sent || 0),
      opened: acc.opened + (day.opened || 0),
      clicked: acc.clicked + (day.clicked || 0),
      replied: acc.replied + (day.replied || 0),
      booked: acc.booked + (day.booked || 0),
      revenue: acc.revenue + parseFloat(day.revenue || 0),
      unsubscribed: acc.unsubscribed + (day.unsubscribed || 0),
    }),
    {
      recipients: 0,
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      booked: 0,
      revenue: 0,
      unsubscribed: 0,
    }
  ) || {
    recipients: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    booked: 0,
    revenue: 0,
    unsubscribed: 0,
  };

  // Calculate rates
  summary.open_rate = summary.sent > 0 ? (summary.opened / summary.sent) * 100 : 0;
  summary.click_rate = summary.sent > 0 ? (summary.clicked / summary.sent) * 100 : 0;
  summary.reply_rate = summary.sent > 0 ? (summary.replied / summary.sent) * 100 : 0;
  summary.booking_rate = summary.sent > 0 ? (summary.booked / summary.sent) * 100 : 0;
  summary.unsubscribe_rate = summary.sent > 0 ? (summary.unsubscribed / summary.sent) * 100 : 0;

  return {
    campaign,
    summary,
    analytics: analytics || [],
  };
}

/**
 * Track email event (open, click, reply, etc.)
 */
export async function trackMarketingEvent(
  campaignId: string,
  recipientEmail: string,
  eventType: "opened" | "clicked" | "replied" | "booked" | "unsubscribed",
  metadata?: any
): Promise<void> {
  const supabase = createClient();

  // Find recipient
  const { data: recipient } = await supabase
    .from("marketing_campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("email", recipientEmail)
    .single();

  if (!recipient) {
    return;
  }

  // Update recipient based on event type
  const updateData: any = {};

  switch (eventType) {
    case "opened":
      if (!recipient.opened_at) {
        updateData.opened_at = new Date().toISOString();
        updateData.status = "opened";
      }
      break;

    case "clicked":
      if (!recipient.clicked_at) {
        updateData.clicked_at = new Date().toISOString();
        updateData.status = "clicked";
      }
      break;

    case "replied":
      if (!recipient.replied_at) {
        updateData.replied_at = new Date().toISOString();
        updateData.status = "replied";
      }
      break;

    case "booked":
      if (!recipient.booked_at) {
        updateData.booked_at = new Date().toISOString();
        updateData.status = "booked";
        updateData.booking_id = metadata?.booking_id || null;
        updateData.revenue = metadata?.revenue || null;
      }
      break;

    case "unsubscribed":
      updateData.unsubscribed_at = new Date().toISOString();
      updateData.status = "unsubscribed";
      break;
  }

  if (Object.keys(updateData).length > 0) {
    await supabase
      .from("marketing_campaign_recipients")
      .update(updateData)
      .eq("id", recipient.id);

    // Re-aggregate analytics
    const { data: campaign } = await supabase
      .from("marketing_campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaign) {
      await aggregateCampaignAnalytics(campaign.workspace_id, campaignId);
    }
  }
}




































