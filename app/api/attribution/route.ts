/**
 * Block 93000 — Lead Attribution API
 * Main API for managing lead attributions, sources, and campaigns
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

// GET /api/attribution - Get attribution data for dashboard
export async function GET(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get("source_id");
    const campaignId = searchParams.get("campaign_id");
    const leadId = searchParams.get("lead_id");

    // Get attribution performance data
    if (sourceId || campaignId) {
      // Get performance metrics from view
      const viewName = sourceId ? "v_lead_source_performance" : "v_campaign_performance";
      const idColumn = sourceId ? "id" : "id";
      const idValue = sourceId || campaignId;

      const { data, error } = await supabase
        .from(viewName)
        .select("*")
        .eq(idColumn, idValue)
        .eq("workspace_id", workspaceId)
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Get attribution for a specific lead
    if (leadId) {
      const { data, error } = await supabase
        .from("lead_attributions")
        .select(`
          *,
          lead_sources (*),
          lead_campaigns (*)
        `)
        .eq("lead_id", leadId)
        .eq("workspace_id", workspaceId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return NextResponse.json(data || null);
    }

    // Get all sources and campaigns for workspace
    const [sources, campaigns, attributions] = await Promise.all([
      supabase
        .from("lead_sources")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("lead_campaigns")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("v_lead_source_performance")
        .select("*")
        .eq("workspace_id", workspaceId),
    ]);

    if (sources.error) throw sources.error;
    if (campaigns.error) throw campaigns.error;
    if (attributions.error) throw attributions.error;

    return NextResponse.json({
      sources: sources.data,
      campaigns: campaigns.data,
      performance: attributions.data,
    });
  } catch (error: any) {
    console.error("Attribution API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch attribution data" },
      { status: 500 }
    );
  }
}

// POST /api/attribution - Create or update attribution
export async function POST(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const { lead_id, source_id, campaign_id, offer, landing_page, utm_params, metadata } = body;

    if (!lead_id) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    // Check if attribution exists
    const { data: existing } = await supabase
      .from("lead_attributions")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("workspace_id", workspaceId)
      .single();

    const attributionData: any = {
      workspace_id: workspaceId,
      lead_id,
      source_id: source_id || null,
      campaign_id: campaign_id || null,
      offer: offer || null,
      landing_page: landing_page || null,
      first_touch: new Date().toISOString(),
      last_touch: new Date().toISOString(),
    };

    if (utm_params) {
      attributionData.utm_source = utm_params.utm_source || null;
      attributionData.utm_medium = utm_params.utm_medium || null;
      attributionData.utm_campaign = utm_params.utm_campaign || null;
      attributionData.utm_term = utm_params.utm_term || null;
      attributionData.utm_content = utm_params.utm_content || null;
    }

    if (metadata) {
      attributionData.metadata = metadata;
    }

    let result;
    if (existing) {
      // Update existing attribution
      const { data, error } = await supabase
        .from("lead_attributions")
        .update({
          ...attributionData,
          last_touch: new Date().toISOString(),
          touch_count: (existing.touch_count || 1) + 1,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new attribution
      const { data, error } = await supabase
        .from("lead_attributions")
        .insert(attributionData)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Attribution creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create attribution" },
      { status: 500 }
    );
  }
}
