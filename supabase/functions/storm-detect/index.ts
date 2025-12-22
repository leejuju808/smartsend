// Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
// Edge Function: /storm-detect
// 
// Detects storms via NOAA API or static feed and activates storm mode for affected workspaces

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

interface StormEvent {
  zip: string;
  type: "hail" | "wind" | "rain" | "ice" | "tree_impact";
  severity: number; // 1-10
  expires?: string; // ISO timestamp
  metadata?: {
    hailSize?: number; // inches
    windSpeed?: number; // mph
    rainfall?: number; // inches
    description?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get storm feed URL from environment (or use placeholder)
    const stormFeedUrl = Deno.env.get("STORM_FEED_URL") || 
      "https://api.weather.gov/alerts/active?severity=Extreme,Severe";

    let storms: StormEvent[] = [];

    try {
      // Try to fetch from NOAA API or configured feed
      const response = await fetch(stormFeedUrl, {
        headers: {
          "User-Agent": "SmartSend-AI/1.0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Parse NOAA alerts format (simplified)
        // In production, you'd parse the actual NOAA alerts JSON structure
        storms = parseNOAAAlerts(data);
      } else {
        console.warn(`Storm feed returned ${response.status}, using empty array`);
      }
    } catch (error) {
      console.error("Error fetching storm feed:", error);
      // For development/testing, return empty array
      // In production, you might want to use a fallback feed or log this error
    }

    // If no storms detected and this is a test, allow manual storms via request body
    if (storms.length === 0 && req.method === "POST") {
      try {
        const body = await req.json();
        if (body.storms && Array.isArray(body.storms)) {
          storms = body.storms;
        }
      } catch {
        // Ignore if body parsing fails
      }
    }

    const now = new Date();
    const processedStorms: string[] = [];

    for (const storm of storms) {
      // Calculate expires_at (default to 7 days if not provided)
      const expiresAt = storm.expires 
        ? new Date(storm.expires)
        : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Insert storm event
      const { data: stormEvent, error: insertError } = await supabase
        .from("storm_events")
        .insert({
          zip_code: storm.zip,
          event_type: storm.type,
          severity: storm.severity,
          detected_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          metadata: storm.metadata || {},
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Error inserting storm event for ZIP ${storm.zip}:`, insertError);
        continue;
      }

      if (!stormEvent) continue;

      processedStorms.push(stormEvent.id);

      // Find all workspaces with this ZIP in their service area
      const { data: territories, error: territoryError } = await supabase
        .from("contractor_territory")
        .select("workspace_id")
        .contains("zip_codes", [storm.zip]);

      if (territoryError) {
        console.error(`Error finding territories for ZIP ${storm.zip}:`, territoryError);
        continue;
      }

      // Activate storm flags for affected workspaces
      if (territories && territories.length > 0) {
        for (const territory of territories) {
          // Get or create storm flag
          const { data: existingFlag, error: flagSelectError } = await supabase
            .from("storm_flags")
            .select("*")
            .eq("workspace_id", territory.workspace_id)
            .single();

          const activeStormIds = existingFlag?.active_storm_event_ids || [];
          
          // Add this storm to the list if not already present
          const updatedStormIds = activeStormIds.includes(stormEvent.id)
            ? activeStormIds
            : [...activeStormIds, stormEvent.id];

          // Upsert storm flag
          const { error: flagError } = await supabase
            .from("storm_flags")
            .upsert({
              workspace_id: territory.workspace_id,
              active: true,
              last_triggered: now.toISOString(),
              active_storm_event_ids: updatedStormIds,
              updated_at: now.toISOString(),
            }, {
              onConflict: "workspace_id",
            });

          if (flagError) {
            console.error(
              `Error updating storm flag for workspace ${territory.workspace_id}:`,
              flagError
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        storms_detected: storms.length,
        storms_processed: processedStorms.length,
        storm_ids: processedStorms,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in storm-detect:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Parse NOAA alerts format into our storm events
 * This is a simplified parser - adjust based on actual NOAA API response structure
 */
function parseNOAAAlerts(data: any): StormEvent[] {
  const storms: StormEvent[] = [];

  if (!data || !data.features) {
    return storms;
  }

  for (const feature of data.features) {
    const properties = feature.properties;
    if (!properties) continue;

    // Extract severity from NOAA severity field
    let severity = 5; // Default
    if (properties.severity === "Extreme") severity = 9;
    else if (properties.severity === "Severe") severity = 7;
    else if (properties.severity === "Moderate") severity = 5;
    else if (properties.severity === "Minor") severity = 3;

    // Determine event type from event name
    let eventType: StormEvent["type"] = "rain";
    const eventName = (properties.event || "").toLowerCase();
    if (eventName.includes("hail")) eventType = "hail";
    else if (eventName.includes("wind")) eventType = "wind";
    else if (eventName.includes("ice") || eventName.includes("freez")) eventType = "ice";
    else if (eventName.includes("tree")) eventType = "tree_impact";

    // Extract ZIP codes from geocodes (simplified - actual parsing would be more complex)
    // NOAA geocodes can include UGC codes that map to counties/ZIPs
    // For now, we'll use a placeholder that needs to be enhanced
    const zipCodes = extractZipCodes(properties.geocode || {});

    for (const zip of zipCodes) {
      storms.push({
        zip,
        type: eventType,
        severity,
        expires: properties.expires,
        metadata: {
          description: properties.headline || properties.description,
        },
      });
    }
  }

  return storms;
}

/**
 * Extract ZIP codes from NOAA geocode data
 * This is a placeholder - actual implementation would parse UGC codes or polygons
 */
function extractZipCodes(geocode: any): string[] {
  // Placeholder: return empty array for now
  // In production, you'd need to:
  // 1. Map UGC (Universal Geographic Code) to ZIP codes
  // 2. Parse polygon coordinates and find intersecting ZIP codes
  // 3. Or use a reverse geocoding service
  
  // For now, return empty array so function doesn't break
  // TODO: Implement proper ZIP code extraction
  return [];
}


































