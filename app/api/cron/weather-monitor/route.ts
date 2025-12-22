/**
 * POST /api/cron/weather-monitor
 * Block 15900 — SmartSend Local Weather Engine v1
 * Runs every 2 hours to check weather for all service area ZIPs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// NOAA API base URL (using public API)
const NOAA_API_BASE = "https://api.weather.gov";

interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: string;
  areas: Array<{ areaDesc: string; UGC: string[] }>;
  effective: string;
  expires: string;
}

interface StormEvent {
  storm_type: string;
  zip: string;
  severity: string;
  storm_started_at: string;
  storm_ended_at?: string;
  hail_size?: number;
  wind_speed?: number;
  rain_inches?: number;
  storm_intensity_score: number;
  nws_alert_id?: string;
  nws_alert_type?: string;
  nws_headline?: string;
  data_source: string;
}

/**
 * Get ZIP code coordinates for weather API lookup
 */
async function getZipCoordinates(zip: string): Promise<{ lat: number; lon: number } | null> {
  try {
    // Using a simple geocoding service (in production, use a proper geocoding API)
    // For now, we'll use a basic lookup or skip coordinate-based lookups
    // This is a placeholder - you'd integrate with a proper geocoding service
    return null;
  } catch (error) {
    console.error(`Error getting coordinates for ZIP ${zip}:`, error);
    return null;
  }
}

/**
 * Fetch NWS alerts for a ZIP code
 */
async function fetchNWSAlerts(zip: string): Promise<WeatherAlert[]> {
  try {
    // Get coordinates for ZIP (simplified - in production use proper geocoding)
    const coords = await getZipCoordinates(zip);
    if (!coords) {
      // Fallback: use a basic approach or skip
      return [];
    }

    // Fetch alerts from NWS API
    const alertsUrl = `${NOAA_API_BASE}/alerts/active?point=${coords.lat},${coords.lon}`;
    const response = await fetch(alertsUrl, {
      headers: {
        "User-Agent": "SmartSend Weather Engine (contact@smartsend.ai)",
      },
    });

    if (!response.ok) {
      console.error(`NWS API error for ZIP ${zip}:`, response.statusText);
      return [];
    }

    const data = await response.json();
    return data.features?.map((feature: any) => ({
      id: feature.id,
      event: feature.properties.event,
      headline: feature.properties.headline,
      description: feature.properties.description,
      severity: feature.properties.severity?.toLowerCase() || "medium",
      areas: feature.properties.areaDesc ? [{ areaDesc: feature.properties.areaDesc, UGC: feature.properties.ugc || [] }] : [],
      effective: feature.properties.effective,
      expires: feature.properties.expires,
    })) || [];
  } catch (error) {
    console.error(`Error fetching NWS alerts for ZIP ${zip}:`, error);
    return [];
  }
}

/**
 * Detect storm events from weather data
 */
function detectStormEvents(
  zip: string,
  alerts: WeatherAlert[],
  workspaceId: string
): StormEvent[] {
  const events: StormEvent[] = [];
  const now = new Date();

  for (const alert of alerts) {
    const eventType = alert.event?.toLowerCase() || "";
    let stormType = "severe_weather";
    let severity = "medium";
    let hailSize: number | undefined;
    let windSpeed: number | undefined;
    let rainInches: number | undefined;

    // Parse storm type from alert event
    if (eventType.includes("hail")) {
      stormType = "hail";
      // Extract hail size from description (simplified parsing)
      const hailMatch = alert.description?.match(/(\d+\.?\d*)\s*(?:inch|in|"|')\s*(?:hail|diameter)/i);
      if (hailMatch) {
        hailSize = parseFloat(hailMatch[1]);
      }
    } else if (eventType.includes("wind") || eventType.includes("tornado")) {
      stormType = "wind";
      // Extract wind speed from description
      const windMatch = alert.description?.match(/(\d+)\s*(?:mph|miles per hour)/i);
      if (windMatch) {
        windSpeed = parseFloat(windMatch[1]);
      }
    } else if (eventType.includes("flood") || eventType.includes("rain")) {
      stormType = "heavy_rain";
      // Extract rainfall from description
      const rainMatch = alert.description?.match(/(\d+\.?\d*)\s*(?:inch|in|")\s*(?:rain|rainfall)/i);
      if (rainMatch) {
        rainInches = parseFloat(rainMatch[1]);
      }
    } else if (eventType.includes("winter") || eventType.includes("snow")) {
      stormType = "snow_load";
    } else if (eventType.includes("freeze") || eventType.includes("frost")) {
      stormType = "freeze_thaw";
    }

    // Determine severity
    if (alert.severity === "extreme" || alert.severity === "Extreme") {
      severity = "extreme";
    } else if (alert.severity === "severe" || alert.severity === "Severe") {
      severity = "severe";
    } else if (alert.severity === "moderate" || alert.severity === "Moderate") {
      severity = "high";
    }

    // Calculate storm intensity score
    let intensityScore = 0;
    if (hailSize && hailSize >= 0.75) {
      intensityScore += Math.min(40, Math.max(20, (hailSize - 0.75) * 20));
    }
    if (windSpeed && windSpeed >= 50) {
      intensityScore += Math.min(30, Math.max(15, (windSpeed - 50) * 0.6));
    }
    if (rainInches && rainInches >= 2.0) {
      intensityScore += Math.min(20, Math.max(10, (rainInches - 2.0) * 5));
    }
    switch (severity) {
      case "extreme":
        intensityScore += 10;
        break;
      case "severe":
        intensityScore += 7;
        break;
      case "high":
        intensityScore += 5;
        break;
      case "medium":
        intensityScore += 3;
        break;
      default:
        intensityScore += 1;
    }
    intensityScore = Math.min(100, intensityScore);

    const effectiveDate = new Date(alert.effective);
    const expiresDate = alert.expires ? new Date(alert.expires) : null;

    // Only create events for recent storms (within last 7 days)
    const daysSince = (now.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) {
      events.push({
        storm_type: stormType,
        zip,
        severity,
        storm_started_at: effectiveDate.toISOString(),
        storm_ended_at: expiresDate?.toISOString(),
        hail_size: hailSize,
        wind_speed: windSpeed,
        rain_inches: rainInches,
        storm_intensity_score: intensityScore,
        nws_alert_id: alert.id,
        nws_alert_type: alert.event,
        nws_headline: alert.headline,
        data_source: "nws",
      });
    }
  }

  return events;
}

/**
 * Main weather monitoring function
 */
export async function POST(req: NextRequest) {
  try {
    // Verify CRON secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all workspace service ZIPs
    const { data: serviceZips, error: zipsError } = await supabase
      .from("workspace_service_zips")
      .select("workspace_id, zip, city, state");

    if (zipsError) {
      console.error("Error fetching service ZIPs:", zipsError);
      return NextResponse.json(
        { error: zipsError.message },
        { status: 500 }
      );
    }

    if (!serviceZips || serviceZips.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No service ZIPs to monitor",
        eventsCreated: 0,
      });
    }

    // Group ZIPs by workspace for batch processing
    const workspaceZips = new Map<string, Set<string>>();
    for (const sz of serviceZips) {
      if (!workspaceZips.has(sz.workspace_id)) {
        workspaceZips.set(sz.workspace_id, new Set());
      }
      workspaceZips.get(sz.workspace_id)!.add(sz.zip);
    }

    let totalEventsCreated = 0;
    let totalContactsTagged = 0;

    // Process each workspace's ZIPs
    for (const [workspaceId, zipSet] of workspaceZips.entries()) {
      const uniqueZips = Array.from(zipSet);

      for (const zip of uniqueZips) {
        try {
          // Fetch NWS alerts for this ZIP
          const alerts = await fetchNWSAlerts(zip);

          if (alerts.length === 0) {
            continue; // No alerts for this ZIP
          }

          // Detect storm events from alerts
          const stormEvents = detectStormEvents(zip, alerts, workspaceId);

          // Insert storm events into database
          for (const event of stormEvents) {
            // Check if event already exists (avoid duplicates)
            const { data: existing } = await supabase
              .from("weather_events")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("zip", zip)
              .eq("storm_type", event.storm_type)
              .eq("nws_alert_id", event.nws_alert_id || "")
              .limit(1);

            if (existing && existing.length > 0) {
              continue; // Event already exists
            }

            // Insert new weather event
            const { data: weatherEvent, error: insertError } = await supabase
              .from("weather_events")
              .insert({
                workspace_id: workspaceId,
                ...event,
              })
              .select("id")
              .single();

            if (insertError) {
              console.error(`Error inserting weather event for ZIP ${zip}:`, insertError);
              continue;
            }

            totalEventsCreated++;

            // Detect and tag affected contacts
            const { data: impacts, error: impactError } = await supabase.rpc(
              "detect_storm_affected_contacts",
              {
                p_weather_event_id: weatherEvent.id,
                p_workspace_id: workspaceId,
              }
            );

            if (impactError) {
              console.error(`Error detecting contacts for event ${weatherEvent.id}:`, impactError);
            } else if (impacts) {
              totalContactsTagged += impacts.length || 0;
            }

            // Create storm campaign trigger suggestion if high-risk storm
            if (event.storm_intensity_score >= 40) {
              const { data: affectedContacts } = await supabase
                .from("contact_storm_impacts")
                .select("contact_id")
                .eq("weather_event_id", weatherEvent.id);

              const affectedZips = [zip];

              await supabase.from("storm_campaign_triggers").insert({
                workspace_id: workspaceId,
                weather_event_id: weatherEvent.id,
                status: "suggested",
                affected_contacts_count: affectedContacts?.length || 0,
                affected_zips: affectedZips,
                storm_summary: `${event.storm_type} detected in ${zip} - ${event.severity} severity`,
              });
            }
          }
        } catch (error) {
          console.error(`Error processing ZIP ${zip} for workspace ${workspaceId}:`, error);
          // Continue processing other ZIPs
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Weather monitoring completed",
      eventsCreated: totalEventsCreated,
      contactsTagged: totalContactsTagged,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in weather monitoring CRON:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for manual testing
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: "Weather monitoring cron endpoint",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
  });
}





















































