/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * Hourly Cron Job: Updates weather risk scores for all scheduled jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchHourlyWeatherForecast,
  calculateWeatherRiskScore,
  getRecommendedAlternativeDates,
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

    // Get all scheduled jobs with install dates in next 7 days
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(
        `
        id,
        workspace_id,
        scheduled_start_date,
        preferred_start_date,
        address,
        lead_id
      `
      )
      .in("status", ["scheduled", "unscheduled"])
      .or(
        `scheduled_start_date.gte.${new Date().toISOString().split("T")[0]},scheduled_start_date.lte.${
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        }`
      );

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "No jobs to process" });
    }

    let processed = 0;
    let errors = 0;

    // Process each job
    for (const job of jobs) {
      try {
        const installDate = job.scheduled_start_date || job.preferred_start_date;
        if (!installDate) continue;

        // Get job location from lead
        let location: { zip?: string; city?: string; state?: string; address?: string } = {};
        
        if (job.lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("zip, city, state, address")
            .eq("id", job.lead_id)
            .single();

          if (lead) {
            location = {
              zip: lead.zip,
              city: lead.city,
              state: lead.state,
              address: lead.address || job.address,
            };
          }
        }

        if (!location.zip && !location.city) {
          console.warn(`Job ${job.id} has no location data`);
          continue;
        }

        // Fetch hourly weather forecast for install date
        const forecast = await fetchHourlyWeatherForecast(
          location,
          new Date(installDate),
          24
        );

        if (forecast.length === 0) {
          console.warn(`No weather forecast for job ${job.id}`);
          continue;
        }

        // Calculate risk score for each hour
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

          const forecastDate = new Date(hour.datetime);
          const forecastHour = forecastDate.getHours();

          // Get recommended alternative dates if risk is high
          let alternativeDates: Date[] = [];
          if (risk.risk_score >= 60) {
            alternativeDates = await getRecommendedAlternativeDates(
              location,
              new Date(installDate),
              7
            );
          }

          // Upsert weather risk score
          const { error: upsertError } = await supabase
            .from("weather_risk_scores")
            .upsert(
              {
                workspace_id: job.workspace_id,
                job_id: job.id,
                location_address: location.address,
                location_city: location.city,
                location_state: location.state,
                location_zip: location.zip,
                forecast_date: forecastDate.toISOString().split("T")[0],
                forecast_hour: forecastHour,
                forecast_datetime: hour.datetime,
                risk_score: risk.risk_score,
                risk_category: risk.risk_category,
                precipitation_probability: hour.precipitation_probability,
                wind_speed_mph: hour.wind_speed_mph,
                wind_gusts_mph: hour.wind_gusts_mph,
                lightning_risk: hour.lightning_risk,
                hail_probability: hour.hail_probability,
                temperature_f: hour.temperature_f,
                storm_nearby: hour.storm_nearby,
                risk_factors: risk.risk_factors,
                risk_reason: risk.risk_factors.join(", "),
                recommendation: risk.recommendation,
                recommended_alternative_dates: alternativeDates.map((d) =>
                  d.toISOString().split("T")[0]
                ),
                weather_provider: process.env.OPENWEATHER_API_KEY
                  ? "openweather"
                  : "weatherapi",
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "workspace_id,job_id,forecast_datetime",
              }
            );

          if (upsertError) {
            console.error(`Error upserting risk score for job ${job.id}:`, upsertError);
            errors++;
            continue;
          }

          // If risk score >= 70, trigger reschedule recommendation
          if (risk.risk_score >= 70) {
            const { error: rescheduleError } = await supabase.rpc(
              "trigger_weather_reschedule",
              {
                p_job_id: job.id,
                p_risk_score: risk.risk_score,
                p_reason: `Weather risk score of ${risk.risk_score} detected`,
              }
            );

            if (rescheduleError) {
              console.error(
                `Error triggering reschedule for job ${job.id}:`,
                rescheduleError
              );
            }
          }

          // If risk score >= 80, block install and send alerts
          if (risk.risk_score >= 80) {
            // Update job to blocked
            await supabase
              .from("roofing_jobs")
              .update({
                weather_blocked: true,
                weather_blocked_reason: `Severe weather risk (${risk.risk_score}%)`,
              })
              .eq("id", job.id);

            // Send alerts to ops, production, crew
            await supabase.rpc("notify_weather_alert", {
              p_workspace_id: job.workspace_id,
              p_job_id: job.id,
              p_weather_type: "severe",
              p_message: `Severe weather risk (${risk.risk_score}%) detected for install on ${installDate}. Install blocked.`,
              p_priority: "critical",
            });
          }
        }

        // Update job weather risk (trigger will handle this, but call explicitly)
        await supabase.rpc("update_job_weather_risk", { p_job_id: job.id });

        processed++;
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      errors,
      message: `Processed ${processed} jobs, ${errors} errors`,
    });
  } catch (error: any) {
    console.error("Weather intelligence cron error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




































