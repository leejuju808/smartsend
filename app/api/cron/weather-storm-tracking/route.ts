/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * Storm Path Tracking Cron Job
 * Tracks storm movement and alerts for storm roofers
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchHourlyWeatherForecast,
  calculateWeatherRiskScore,
} from "@/lib/weather/weather-intelligence";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all unique ZIP codes from leads and jobs
    const { data: locations } = await supabase
      .from("leads")
      .select("zip, city, state")
      .not("zip", "is", null)
      .limit(1000);

    if (!locations || locations.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No locations to check",
      });
    }

    // Group by ZIP
    const zipMap = new Map<string, { city?: string; state?: string }>();
    for (const loc of locations) {
      if (loc.zip && !zipMap.has(loc.zip)) {
        zipMap.set(loc.zip, { city: loc.city || undefined, state: loc.state || undefined });
      }
    }

    let stormsDetected = 0;
    let alertsSent = 0;

    // Check each ZIP for storms
    for (const [zip, location] of zipMap) {
      try {
        // Fetch forecast for next 48 hours
        const forecast = await fetchHourlyWeatherForecast(
          { zip, ...location },
          new Date(),
          48
        );

        // Check for storm conditions
        for (const hour of forecast) {
          const risk = calculateWeatherRiskScore(
            hour.precipitation_probability,
            hour.wind_speed_mph,
            hour.wind_gusts_mph,
            hour.lightning_risk,
            hour.hail_probability,
            hour.temperature_f,
            hour.storm_nearby
          );

          // If severe risk detected, track as storm
          if (risk.risk_score >= 70 && risk.storm_nearby) {
            const stormDate = new Date(hour.datetime);
            const stormId = `storm_${zip}_${stormDate.toISOString().split("T")[0]}`;

            // Upsert storm tracking
            const { data: existingStorm } = await supabase
              .from("storm_tracking")
              .select("id, affected_zips, affected_job_ids, affected_lead_ids")
              .eq("storm_id", stormId)
              .single();

            // Get affected leads and jobs for this ZIP
            const { data: affectedLeads } = await supabase
              .from("leads")
              .select("id")
              .eq("zip", zip);

            const { data: affectedJobs } = await supabase
              .from("roofing_jobs")
              .select("id, lead_id")
              .in(
                "lead_id",
                (affectedLeads || []).map((l) => l.id)
              );

            const leadIds = (affectedLeads || []).map((l) => l.id);
            const jobIds = (affectedJobs || []).map((j) => j.id);

            if (existingStorm) {
              // Update existing storm
              const updatedZips = Array.from(
                new Set([...(existingStorm.affected_zips || []), zip])
              );
              const updatedLeads = Array.from(
                new Set([...(existingStorm.affected_lead_ids || []), ...leadIds])
              );
              const updatedJobs = Array.from(
                new Set([...(existingStorm.affected_job_ids || []), ...jobIds])
              );

              await supabase
                .from("storm_tracking")
                .update({
                  affected_zips: updatedZips,
                  affected_lead_ids: updatedLeads,
                  affected_job_ids: updatedJobs,
                  status: "active",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingStorm.id);
            } else {
              // Create new storm
              const { data: workspace } = await supabase
                .from("workspaces")
                .select("id")
                .limit(1)
                .single();

              if (workspace) {
                await supabase.from("storm_tracking").insert({
                  workspace_id: workspace.id,
                  storm_id: stormId,
                  storm_type: determineStormType(risk),
                  affected_zips: [zip],
                  affected_lead_ids: leadIds,
                  affected_job_ids: jobIds,
                  max_wind_speed_mph: hour.wind_speed_mph,
                  precipitation_amount_inches: hour.precipitation_probability / 100,
                  status: "active",
                  detected_at: new Date().toISOString(),
                });

                stormsDetected++;

                // Send alerts for affected jobs
                if (jobIds.length > 0) {
                  for (const jobId of jobIds) {
                    const { data: job } = await supabase
                      .from("roofing_jobs")
                      .select("workspace_id")
                      .eq("id", jobId)
                      .single();

                    if (job) {
                      await supabase.rpc("notify_weather_alert", {
                        p_workspace_id: job.workspace_id,
                        p_job_id: jobId,
                        p_weather_type: "storm",
                        p_message: `Storm detected affecting ZIP ${zip}. Monitor weather conditions.`,
                        p_priority: "high",
                      });

                      alertsSent++;
                    }
                  }
                }

                // Log weather event
                if (jobIds.length > 0) {
                  for (const jobId of jobIds) {
                    const { data: job } = await supabase
                      .from("roofing_jobs")
                      .select("workspace_id")
                      .eq("id", jobId)
                      .single();

                    if (job) {
                      await supabase.from("weather_events").insert({
                        workspace_id: job.workspace_id,
                        job_id: jobId,
                        event_type: "storm_alert",
                        event_title: "Storm Path Alert",
                        event_message: `Storm detected affecting ZIP ${zip}`,
                        event_severity: "warning",
                        event_date: stormDate.toISOString().split("T")[0],
                        weather_snapshot: {
                          wind_speed_mph: hour.wind_speed_mph,
                          precipitation_probability: hour.precipitation_probability,
                          storm_nearby: true,
                        },
                      });
                    }
                  }
                }
              }
            }

            break; // Only track one storm per ZIP per day
          }
        }
      } catch (error) {
        console.error(`Error checking ZIP ${zip}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      storms_detected: stormsDetected,
      alerts_sent: alertsSent,
      message: `Detected ${stormsDetected} storms, sent ${alertsSent} alerts`,
    });
  } catch (error: any) {
    console.error("Storm tracking cron error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

function determineStormType(risk: any): string {
  if (risk.hail_probability >= 40) return "hail";
  if (risk.wind_speed_mph >= 35) return "wind";
  if (risk.lightning_risk >= 70) return "thunderstorm";
  return "thunderstorm";
}




































