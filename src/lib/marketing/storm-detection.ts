/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Storm Detection & Campaign Triggering
 * 
 * Functions for detecting storms and automatically creating campaign triggers
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Process a new storm event and create campaign triggers
 */
export async function processStormEventForMarketing(
  workspaceId: string,
  stormEventId: string
): Promise<void> {
  const supabase = createClient();

  // Get storm event
  const { data: stormEvent } = await supabase
    .from("storm_events")
    .select("*")
    .eq("id", stormEventId)
    .single();

  if (!stormEvent) {
    return;
  }

  // Check if workspace has storm campaign templates configured
  const { data: stormTemplates } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("campaign_type", "storm_outbound")
    .eq("status", "draft")
    .limit(1);

  // Determine affected areas
  const affectedZips = stormEvent.affected_zip
    ? [stormEvent.affected_zip]
    : await getZipsInArea(
        stormEvent.affected_city,
        stormEvent.affected_state,
        stormEvent.affected_county
      );

  // Create storm campaign trigger
  const { data: trigger } = await supabase
    .from("storm_campaign_triggers")
    .insert({
      workspace_id: workspaceId,
      storm_event_id: stormEventId,
      campaign_template_id: stormTemplates?.[0]?.id || null,
      auto_create: false,
      requires_approval: true,
      affected_zips: affectedZips,
      affected_neighborhoods: [],
      radius_miles: 5,
      approval_status: "pending",
    })
    .select()
    .single();

  if (!trigger) {
    return;
  }

  // If auto_create is enabled and template exists, create campaign
  if (stormTemplates && stormTemplates.length > 0) {
    const template = stormTemplates[0];
    
    // Create campaign from template
    const { data: campaign } = await supabase
      .from("marketing_campaigns")
      .insert({
        workspace_id: workspaceId,
        name: `Storm Campaign - ${stormEvent.affected_city}, ${stormEvent.affected_state} - ${new Date().toLocaleDateString()}`,
        campaign_type: "storm_outbound",
        targeting_type: "storm_path",
        targeting_config: {
          zips: affectedZips,
          radius_miles: 5,
        },
        subject_template: template.subject_template,
        body_template: template.body_template,
        storm_event_id: stormEventId,
        storm_zip: stormEvent.affected_zip || null,
        storm_severity: stormEvent.intensity || null,
        status: "draft",
        created_by: null, // System-created
      })
      .select()
      .single();

    if (campaign) {
      // Update trigger with campaign ID
      await supabase
        .from("storm_campaign_triggers")
        .update({ campaign_id: campaign.id })
        .eq("id", trigger.id);
    }
  }

  // Notify workspace members (optional)
  await notifyStormAlert(workspaceId, stormEvent, trigger);
}

/**
 * Auto-approve and launch storm campaign if configured
 */
export async function autoApproveStormCampaign(
  workspaceId: string,
  triggerId: string
): Promise<void> {
  const supabase = createClient();

  // Get trigger
  const { data: trigger } = await supabase
    .from("storm_campaign_triggers")
    .select("*")
    .eq("id", triggerId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!trigger || trigger.requires_approval) {
    return; // Don't auto-approve if approval required
  }

  // Approve trigger
  await supabase
    .from("storm_campaign_triggers")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", triggerId);

  // Launch campaign if exists
  if (trigger.campaign_id) {
    const launchResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/marketing/campaigns/${trigger.campaign_id}/launch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }
    );

    if (launchResponse.ok) {
      await supabase
        .from("storm_campaign_triggers")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", triggerId);
    }
  }
}

/**
 * Get ZIP codes in an area (city, state, county)
 */
async function getZipsInArea(
  city?: string,
  state?: string,
  county?: string
): Promise<string[]> {
  // This would require a ZIP code database
  // For now, return empty array - implement based on your geographic data
  return [];
}

/**
 * Notify workspace members of storm alert
 */
async function notifyStormAlert(
  workspaceId: string,
  stormEvent: any,
  trigger: any
): Promise<void> {
  // Send notification to workspace members
  // This is a placeholder - implement based on your notification system
  console.log("Storm alert:", { workspaceId, stormEvent, trigger });
}




































