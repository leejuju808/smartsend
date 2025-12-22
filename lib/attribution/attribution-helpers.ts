/**
 * Block 93000 — Lead Attribution Helpers
 * Auto-tag leads with source, campaign, and attribution data
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface AttributionData {
  source_id?: string;
  campaign_id?: string;
  offer?: string;
  landing_page?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  metadata?: Record<string, any>;
}

/**
 * Auto-create or update attribution for a lead
 */
export async function autoAttributeLead(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  attributionData: AttributionData
): Promise<void> {
  try {
    // Check if attribution already exists
    const { data: existing } = await supabase
      .from("lead_attributions")
      .select("id, touch_count, first_touch")
      .eq("lead_id", leadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const now = new Date().toISOString();
    const touchCount = existing ? (existing.touch_count || 1) + 1 : 1;
    const firstTouch = existing?.first_touch || now;

    const attributionPayload: any = {
      workspace_id: workspaceId,
      lead_id: leadId,
      source_id: attributionData.source_id || null,
      campaign_id: attributionData.campaign_id || null,
      offer: attributionData.offer || null,
      landing_page: attributionData.landing_page || null,
      referrer: attributionData.referrer || null,
      utm_source: attributionData.utm_source || null,
      utm_medium: attributionData.utm_medium || null,
      utm_campaign: attributionData.utm_campaign || null,
      utm_term: attributionData.utm_term || null,
      utm_content: attributionData.utm_content || null,
      first_touch: firstTouch,
      last_touch: now,
      touch_count: touchCount,
      metadata: attributionData.metadata || {},
    };

    if (existing) {
      // Update existing attribution
      await supabase
        .from("lead_attributions")
        .update(attributionPayload)
        .eq("id", existing.id);
    } else {
      // Create new attribution
      await supabase.from("lead_attributions").insert(attributionPayload);
    }

    // Record touchpoint
    if (attributionData.source_id || attributionData.campaign_id) {
      await supabase.from("attribution_touchpoints").insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        source_id: attributionData.source_id || null,
        campaign_id: attributionData.campaign_id || null,
        touch_type: "email_replied",
        touch_timestamp: now,
        metadata: attributionData.metadata || {},
      });
    }
  } catch (error) {
    console.error("Error auto-attributing lead:", error);
    // Don't throw - attribution failures shouldn't break lead creation
  }
}

/**
 * Attribute lead from cold email reply
 */
export async function attributeFromEmailReply(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  emailLogId: string,
  campaignId?: string
): Promise<void> {
  try {
    // Get email log details
    const { data: emailLog } = await supabase
      .from("email_logs")
      .select("campaign_id, subject, metadata")
      .eq("id", emailLogId)
      .maybeSingle();

    // Find or create "Cold Email" source
    let { data: coldEmailSource } = await supabase
      .from("lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Cold Email")
      .maybeSingle();

    if (!coldEmailSource) {
      const { data: newSource } = await supabase
        .from("lead_sources")
        .insert({
          workspace_id: workspaceId,
          name: "Cold Email",
          channel_type: "outbound",
        })
        .select("id")
        .single();
      coldEmailSource = newSource;
    }

    // Find campaign if provided
    let leadCampaignId = campaignId || emailLog?.campaign_id;
    let leadCampaign = null;
    if (leadCampaignId) {
      // Check if it's a lead_campaigns entry
      const { data: lc } = await supabase
        .from("lead_campaigns")
        .select("id")
        .eq("campaign_id", leadCampaignId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (lc) {
        leadCampaign = lc;
      } else {
        // Create lead_campaign entry from campaign
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("name, workspace_id")
          .eq("id", leadCampaignId)
          .maybeSingle();

        if (campaign) {
          const { data: newLc } = await supabase
            .from("lead_campaigns")
            .insert({
              workspace_id: workspaceId,
              name: campaign.name || "Campaign",
              medium: "email",
              campaign_id: leadCampaignId,
            })
            .select("id")
            .single();
          leadCampaign = newLc;
        }
      }
    }

    await autoAttributeLead(supabase, workspaceId, leadId, {
      source_id: coldEmailSource?.id,
      campaign_id: leadCampaign?.id || null,
      offer: emailLog?.metadata?.offer || null,
      metadata: {
        email_log_id: emailLogId,
        subject: emailLog?.subject || null,
        source_type: "cold_email_reply",
      },
    });
  } catch (error) {
    console.error("Error attributing from email reply:", error);
  }
}

/**
 * Attribute lead from phone call
 */
export async function attributeFromPhoneCall(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  callerId?: string
): Promise<void> {
  try {
    // Find or create "Phone Call" source
    let { data: phoneSource } = await supabase
      .from("lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Phone Call")
      .maybeSingle();

    if (!phoneSource) {
      const { data: newSource } = await supabase
        .from("lead_sources")
        .insert({
          workspace_id: workspaceId,
          name: "Phone Call",
          channel_type: "inbound",
        })
        .select("id")
        .single();
      phoneSource = newSource;
    }

    await autoAttributeLead(supabase, workspaceId, leadId, {
      source_id: phoneSource?.id,
      metadata: {
        caller_id: callerId || null,
        source_type: "phone_call",
      },
    });
  } catch (error) {
    console.error("Error attributing from phone call:", error);
  }
}

/**
 * Attribute lead from website form
 */
export async function attributeFromWebsiteForm(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  formUrl?: string,
  referrer?: string,
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  }
): Promise<void> {
  try {
    // Find or create "Website Form" source
    let { data: websiteSource } = await supabase
      .from("lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Website Form")
      .maybeSingle();

    if (!websiteSource) {
      const { data: newSource } = await supabase
        .from("lead_sources")
        .insert({
          workspace_id: workspaceId,
          name: "Website Form",
          channel_type: "inbound",
        })
        .select("id")
        .single();
      websiteSource = newSource;
    }

    await autoAttributeLead(supabase, workspaceId, leadId, {
      source_id: websiteSource?.id,
      landing_page: formUrl || null,
      referrer: referrer || null,
      utm_source: utmParams?.utm_source || null,
      utm_medium: utmParams?.utm_medium || null,
      utm_campaign: utmParams?.utm_campaign || null,
      utm_term: utmParams?.utm_term || null,
      utm_content: utmParams?.utm_content || null,
      metadata: {
        source_type: "website_form",
      },
    });
  } catch (error) {
    console.error("Error attributing from website form:", error);
  }
}

/**
 * Attribute lead from QR code scan
 */
export async function attributeFromQRCode(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  qrCodeId: string
): Promise<void> {
  try {
    // Get QR code details
    const { data: qrCode } = await supabase
      .from("qr_codes")
      .select("id, source_id, campaign_id, label")
      .eq("id", qrCodeId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!qrCode) {
      console.warn(`QR code ${qrCodeId} not found`);
      return;
    }

    // Find or create "QR Code" source if not set
    let sourceId = qrCode.source_id;
    if (!sourceId) {
      let { data: qrSource } = await supabase
        .from("lead_sources")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", "QR Code")
        .maybeSingle();

      if (!qrSource) {
        const { data: newSource } = await supabase
          .from("lead_sources")
          .insert({
            workspace_id: workspaceId,
            name: "QR Code",
            channel_type: "offline",
          })
          .select("id")
          .single();
        qrSource = newSource;
      }
      sourceId = qrSource?.id;
    }

    // Increment QR code metrics
    const { data: currentQR } = await supabase
      .from("qr_codes")
      .select("scans, leads_generated")
      .eq("id", qrCodeId)
      .single();

    if (currentQR) {
      await supabase
        .from("qr_codes")
        .update({
          scans: (currentQR.scans || 0) + 1,
          leads_generated: (currentQR.leads_generated || 0) + 1,
        })
        .eq("id", qrCodeId);
    }

    await autoAttributeLead(supabase, workspaceId, leadId, {
      source_id: sourceId || null,
      campaign_id: qrCode.campaign_id || null,
      metadata: {
        qr_code_id: qrCodeId,
        qr_code_label: qrCode.label || null,
        source_type: "qr_code_scan",
      },
    });
  } catch (error) {
    console.error("Error attributing from QR code:", error);
  }
}

/**
 * Attribute lead from referral
 */
export async function attributeFromReferral(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
  referredBy?: string
): Promise<void> {
  try {
    // Find or create "Referral" source
    let { data: referralSource } = await supabase
      .from("lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Referral")
      .maybeSingle();

    if (!referralSource) {
      const { data: newSource } = await supabase
        .from("lead_sources")
        .insert({
          workspace_id: workspaceId,
          name: "Referral",
          channel_type: "inbound",
        })
        .select("id")
        .single();
      referralSource = newSource;
    }

    await autoAttributeLead(supabase, workspaceId, leadId, {
      source_id: referralSource?.id,
      metadata: {
        referred_by: referredBy || null,
        source_type: "referral",
      },
    });
  } catch (error) {
    console.error("Error attributing from referral:", error);
  }
}

/**
 * Update attribution revenue when job is won
 */
export async function updateAttributionRevenue(
  supabase: SupabaseClient,
  leadId: string,
  revenue: number,
  costToAcquire?: number
): Promise<void> {
  try {
    const { data: attribution } = await supabase
      .from("lead_attributions")
      .select("id, revenue_attributed, cost_to_acquire")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!attribution) {
      console.warn(`No attribution found for lead ${leadId}`);
      return;
    }

    const newRevenue = (attribution.revenue_attributed || 0) + revenue;
    const newCost = costToAcquire || attribution.cost_to_acquire || 0;
    const roi = newCost > 0 ? ((newRevenue - newCost) / newCost) * 100 : null;

    await supabase
      .from("lead_attributions")
      .update({
        revenue_attributed: newRevenue,
        cost_to_acquire: newCost,
        roi: roi ? Math.round(roi * 100) / 100 : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attribution.id);
  } catch (error) {
    console.error("Error updating attribution revenue:", error);
  }
}



























