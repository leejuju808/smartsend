// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Edge Function: /storm/detect
// 
// Runs hourly: Checks hail & wind maps, creates storm_event, adds affected zips

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StormEventInput {
  workspace_id?: string;
  storm_type: "hail" | "wind" | "rain" | "ice" | "tree_impact";
  event_date: string; // ISO date string
  affected_zips: string[];
  severity?: {
    hail_size?: number;
    wind_speed?: number;
    rating?: number;
    description?: string;
  };
  expires_at?: string; // ISO timestamp
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { workspace_id, storm_type, event_date, affected_zips, severity, expires_at } = body as StormEventInput;

    // Validate required fields
    if (!storm_type || !event_date || !affected_zips || affected_zips.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: storm_type, event_date, affected_zips" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If workspace_id provided, create for that workspace
    // Otherwise, try to detect storms for all workspaces (cron job)
    if (workspace_id) {
      const { data: stormEvent, error } = await supabase
        .from("storm_events")
        .insert({
          workspace_id,
          storm_type,
          event_date,
          affected_zips,
          severity: severity || {},
          expires_at: expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ ok: true, storm_event: stormEvent }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cron mode: Check storm APIs and create events for affected workspaces
    const stormFeedUrl = Deno.env.get("STORM_FEED_URL") || 
      "https://api.weather.gov/alerts/active?severity=Extreme,Severe";

    let detectedStorms: StormEventInput[] = [];

    try {
      const response = await fetch(stormFeedUrl, {
        headers: { "User-Agent": "SmartSend-AI/1.0" },
      });

      if (response.ok) {
        const data = await response.json();
        detectedStorms = parseNOAAAlerts(data);
      }
    } catch (error) {
      console.error("Error fetching storm feed:", error);
    }

    // For each detected storm, find affected workspaces and create events
    const createdEvents = [];
    for (const storm of detectedStorms) {
      // Find workspaces with service areas matching affected zips
      const { data: territories } = await supabase
        .from("contractor_territory")
        .select("workspace_id, zip_codes")
        .overlaps("zip_codes", storm.affected_zips);

      if (territories && territories.length > 0) {
        const workspaceIds = [...new Set(territories.map(t => t.workspace_id))];
        
        for (const wsId of workspaceIds) {
          const { data: stormEvent, error } = await supabase
            .from("storm_events")
            .insert({
              workspace_id: wsId,
              storm_type: storm.storm_type,
              event_date: storm.event_date,
              affected_zips: storm.affected_zips,
              severity: storm.severity || {},
              expires_at: storm.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              is_active: true,
            })
            .select()
            .single();

          if (!error && stormEvent) {
            createdEvents.push(stormEvent);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        storms_detected: detectedStorms.length,
        events_created: createdEvents.length,
        events: createdEvents 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in storm/detect:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseNOAAAlerts(data: any): StormEventInput[] {
  const storms: StormEventInput[] = [];

  if (!data || !data.features) {
    return storms;
  }

  for (const feature of data.features) {
    const properties = feature.properties;
    if (!properties) continue;

    let severity = { rating: 5 };
    if (properties.severity === "Extreme") severity.rating = 9;
    else if (properties.severity === "Severe") severity.rating = 7;
    else if (properties.severity === "Modreme") severity.rating = 5;
    else if (properties.severity === "Minor") severity.rating = 3;

    let eventType: StormEventInput["storm_type"] = "rain";
    const eventName = (properties.event || "").toLowerCase();
    if (eventName.includes("hail")) {
      eventType = "hail";
      severity.hail_size = parseFloat(properties.headline?.match(/(\d+\.?\d*)\s*inch/i)?.[1] || "0");
    } else if (eventName.includes("wind")) {
      eventType = "wind";
      severity.wind_speed = parseFloat(properties.headline?.match(/(\d+)\s*mph/i)?.[1] || "0");
    } else if (eventName.includes("ice") || eventName.includes("freez")) {
      eventType = "ice";
    } else if (eventName.includes("tree")) {
      eventType = "tree_impact";
    }

    const zipCodes = extractZipCodes(properties.geocode || {});
    if (zipCodes.length > 0) {
      storms.push({
        storm_type: eventType,
        event_date: new Date().toISOString().split("T")[0],
        affected_zips: zipCodes,
        severity: {
          ...severity,
          description: properties.headline || properties.description,
        },
        expires_at: properties.expires,
      });
    }
  }

  return storms;
}

function extractZipCodes(geocode: any): string[] {
  // Placeholder: In production, parse UGC codes or polygons to ZIP codes
  // For now, return empty array - this would need proper geocoding service
  return [];
}
































