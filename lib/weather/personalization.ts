/**
 * Block 15900 — SmartSend Local Weather Engine v1
 * Storm Personalization Helpers
 * Functions to insert storm data into email templates
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface StormPersonalizationData {
  recent_storm_date?: string;
  storm_type?: string;
  storm_severity?: string;
  hail_date?: string;
  hail_size?: number;
  wind_speed?: number;
  rain_inches?: number;
  neighborhood?: string;
  zip?: string;
  storm_risk_level?: string;
  storm_risk_score?: number;
}

/**
 * Get storm personalization data for a contact
 */
export async function getStormPersonalizationData(
  contactId: string,
  workspaceId: string
): Promise<StormPersonalizationData> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the most recent storm impact for this contact
    const { data: impact } = await supabase
      .from("contact_storm_impacts")
      .select(
        `
        *,
        weather_event:weather_events(*),
        contact:contacts(zip, postal_code, city)
      `
      )
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("detected_at", { ascending: false })
      .limit(1)
      .single();

    if (!impact || !impact.weather_event) {
      return {};
    }

    const event = impact.weather_event;
    const contact = impact.contact;

    return {
      recent_storm_date: event.storm_started_at
        ? new Date(event.storm_started_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : undefined,
      storm_type: event.storm_type?.replace("_", " "),
      storm_severity: event.severity,
      hail_date:
        event.storm_type === "hail" && event.storm_started_at
          ? new Date(event.storm_started_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })
          : undefined,
      hail_size: event.hail_size,
      wind_speed: event.wind_speed,
      rain_inches: event.rain_inches,
      neighborhood: contact?.city || undefined,
      zip: contact?.postal_code || contact?.zip || undefined,
      storm_risk_level: impact.storm_risk_level,
      storm_risk_score: impact.storm_risk_score,
    };
  } catch (error) {
    console.error("Error getting storm personalization data:", error);
    return {};
  }
}

/**
 * Replace storm placeholders in email template
 */
export function replaceStormPlaceholders(
  template: string,
  data: StormPersonalizationData
): string {
  let result = template;

  // Replace placeholders
  result = result.replace(/\{\{recent_storm_date\}\}/g, data.recent_storm_date || "recently");
  result = result.replace(/\{\{storm_type\}\}/g, data.storm_type || "storm");
  result = result.replace(/\{\{storm_severity\}\}/g, data.storm_severity || "severe");
  result = result.replace(/\{\{hail_date\}\}/g, data.hail_date || "recently");
  result = result.replace(/\{\{hail_size\}\}/g, data.hail_size?.toString() || "");
  result = result.replace(/\{\{wind_speed\}\}/g, data.wind_speed?.toString() || "");
  result = result.replace(/\{\{rain_inches\}\}/g, data.rain_inches?.toString() || "");
  result = result.replace(/\{\{neighborhood\}\}/g, data.neighborhood || "your area");
  result = result.replace(/\{\{zip\}\}/g, data.zip || "");
  result = result.replace(/\{\{storm_risk_level\}\}/g, data.storm_risk_level || "low");

  // Smart replacements based on storm type
  if (data.storm_type === "hail" && data.hail_size && data.hail_size >= 0.75) {
    result = result.replace(
      /\{\{storm_context\}\}/g,
      `Last week's ${data.hail_size}" hail in ${data.neighborhood || data.zip || "your area"} can loosen shingles`
    );
  } else if (data.storm_type === "wind" && data.wind_speed && data.wind_speed >= 50) {
    result = result.replace(
      /\{\{storm_context\}\}/g,
      `People in ${data.zip || data.neighborhood || "your area"} saw ${data.wind_speed}mph winds — want me to check the roof?`
    );
  } else if (data.storm_type === "heavy_rain" && data.rain_inches && data.rain_inches >= 2.0) {
    result = result.replace(
      /\{\{storm_context\}\}/g,
      `The ${data.rain_inches}" of rain in ${data.neighborhood || data.zip || "your area"} can cause roof leaks`
    );
  } else {
    result = result.replace(
      /\{\{storm_context\}\}/g,
      `Recent weather in ${data.neighborhood || data.zip || "your area"} may have affected your roof`
    );
  }

  return result;
}

/**
 * Generate storm-based email opener
 */
export function generateStormOpener(data: StormPersonalizationData): string {
  if (!data.storm_type || !data.recent_storm_date) {
    return "";
  }

  const stormType = data.storm_type.replace("_", " ");
  const location = data.neighborhood || data.zip || "your area";

  if (data.storm_type === "hail" && data.hail_size && data.hail_size >= 0.75) {
    return `Last week's ${data.hail_size}" hail in ${location} can loosen shingles.`;
  } else if (data.storm_type === "wind" && data.wind_speed && data.wind_speed >= 50) {
    return `People in ${location} saw ${data.wind_speed}mph winds — want me to check the roof?`;
  } else if (data.storm_type === "heavy_rain" && data.rain_inches && data.rain_inches >= 2.0) {
    return `The ${data.rain_inches}" of rain in ${location} can cause roof leaks.`;
  } else {
    return `Recent ${stormType} in ${location} may have affected your roof.`;
  }
}





















































