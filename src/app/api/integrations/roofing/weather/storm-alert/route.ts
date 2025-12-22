/**
 * Weather/Storm Alert Integration
 * 
 * Handles storm alerts from:
 * - NOAA Weather Alerts API
 * - HailTrace (future)
 * - Hail Recon (future)
 * 
 * Storm data drives massive roofing revenue.
 * SmartSend sends: "Storm in Spokane — launch storm outreach now."
 * Roofers click once → SmartSend sends the perfect storm campaign.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      integration_id,
      workspace_id,
      alert_type, // 'hail', 'wind', 'tornado', 'severe_weather', 'storm'
      severity, // 'minor', 'moderate', 'severe', 'extreme'
      city,
      state,
      zip_code,
      county,
      latitude,
      longitude,
      wind_speed_mph,
      hail_size_inches,
      storm_date,
      raw_data
    } = body;

    if (!integration_id || !workspace_id || !alert_type || !city || !state) {
      return NextResponse.json(
        { error: "Missing required fields: integration_id, workspace_id, alert_type, city, state" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Store storm alert
    const { data: stormAlert, error: alertError } = await supabase
      .from("storm_alerts")
      .insert({
        integration_id,
        workspace_id,
        alert_type,
        severity: severity || "moderate",
        city,
        state,
        zip_code: zip_code || null,
        county: county || null,
        latitude: latitude || null,
        longitude: longitude || null,
        wind_speed_mph: wind_speed_mph || null,
        hail_size_inches: hail_size_inches || null,
        storm_date: storm_date || new Date().toISOString().split("T")[0],
        raw_data: raw_data || {}
      })
      .select("id")
      .single();

    if (alertError) {
      console.error("Failed to store storm alert:", alertError);
      return NextResponse.json(
        { error: "Failed to store storm alert" },
        { status: 500 }
      );
    }

    // Check if workspace has storm campaign configured
    const { data: stormCampaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .ilike("name", "%storm%")
      .limit(1);

    if (stormCampaigns && stormCampaigns.length > 0) {
      const campaignId = stormCampaigns[0].id;

      // Mark alert as campaign triggered
      await supabase
        .from("storm_alerts")
        .update({
          campaign_triggered: true,
          campaign_triggered_at: new Date().toISOString(),
          campaign_id
        })
        .eq("id", stormAlert.id);

      // TODO: Trigger storm campaign for leads in affected area
      // This would query leads by zip_code/city/state and add them to the campaign
    }

    return NextResponse.json({
      success: true,
      alert_id: stormAlert.id,
      message: `Storm alert processed for ${city}, ${state}`,
      campaign_triggered: stormCampaigns && stormCampaigns.length > 0
    });

  } catch (error) {
    console.error("Error processing storm alert:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































