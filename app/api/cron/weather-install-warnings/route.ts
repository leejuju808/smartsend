/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * Install-Day Warnings Cron Job
 * Runs every morning at 6 AM to send warnings for installs happening today
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const today = new Date().toISOString().split("T")[0];

    // Get all installs scheduled for today
    const { data: installs, error: installsError } = await supabase
      .from("calendar_events")
      .select(
        `
        id,
        workspace_id,
        job_id,
        event_date,
        event_start_time,
        crew_id,
        contact_id,
        weather_risk_score_hourly,
        weather_risk_category_hourly
      `
      )
      .eq("event_type", "INSTALL_DATE")
      .eq("event_date", today)
      .eq("status", "scheduled");

    if (installsError) {
      console.error("Error fetching installs:", installsError);
      return NextResponse.json({ error: installsError.message }, { status: 500 });
    }

    if (!installs || installs.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No installs scheduled for today",
      });
    }

    let processed = 0;
    let warningsSent = 0;

    for (const install of installs) {
      try {
        // Get latest weather risk score for this install
        const { data: riskScore } = await supabase
          .from("weather_risk_scores")
          .select("*")
          .eq("job_id", install.job_id)
          .eq("forecast_date", today)
          .order("forecast_datetime", { ascending: false })
          .limit(1)
          .single();

        if (!riskScore) {
          continue;
        }

        const risk = riskScore.risk_score;
        const category = riskScore.risk_category;

        // Send warnings based on risk level
        if (risk >= 60) {
          // High risk - send critical warning
          const warningMessage = buildWarningMessage(riskScore, "critical");

          // Notify ops and production
          await supabase.rpc("notify_weather_alert", {
            p_workspace_id: install.workspace_id,
            p_job_id: install.job_id,
            p_weather_type: "high_risk",
            p_message: warningMessage,
            p_priority: risk >= 80 ? "critical" : "high",
          });

          // Notify crew if assigned
          if (install.crew_id) {
            const { data: crew } = await supabase
              .from("crews")
              .select("foreman_phone, foreman_name")
              .eq("id", install.crew_id)
              .single();

            if (crew) {
              // Create crew notification
              await supabase.from("notifications").insert({
                workspace_id: install.workspace_id,
                category: "weather",
                type: "weather_alert",
                title: "🌧️ Weather Warning for Today's Install",
                message: warningMessage,
                metadata: {
                  job_id: install.job_id,
                  crew_id: install.crew_id,
                  risk_score: risk,
                },
              });
            }
          }

          // Log weather event
          await supabase.from("weather_events").insert({
            workspace_id: install.workspace_id,
            job_id: install.job_id,
            calendar_event_id: install.id,
            weather_risk_score_id: riskScore.id,
            event_type: "install_warning_sent",
            event_title: "Install-Day Weather Warning",
            event_message: warningMessage,
            event_severity: risk >= 80 ? "critical" : "warning",
            event_date: today,
            event_time: install.event_start_time,
            weather_snapshot: {
              wind_speed_mph: riskScore.wind_speed_mph,
              wind_gusts_mph: riskScore.wind_gusts_mph,
              rain_probability: riskScore.precipitation_probability,
              temperature_f: riskScore.temperature_f,
              lightning_risk: riskScore.lightning_risk,
              hail_probability: riskScore.hail_probability,
            },
            notified_roles: ["ops", "production", "crew"],
            metadata: {
              risk_score: risk,
              risk_category: category,
            },
          });

          // Update calendar event
          await supabase
            .from("calendar_events")
            .update({
              weather_warning_sent: true,
              weather_warning_sent_at: new Date().toISOString(),
            })
            .eq("id", install.id);

          warningsSent++;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing install ${install.id}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      warnings_sent: warningsSent,
      message: `Processed ${processed} installs, sent ${warningsSent} warnings`,
    });
  } catch (error: any) {
    console.error("Install warnings cron error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

function buildWarningMessage(riskScore: any, severity: string): string {
  const factors: string[] = [];

  if (riskScore.wind_gusts_mph >= 30) {
    factors.push(`High wind warning (${Math.round(riskScore.wind_gusts_mph)}mph gusts)`);
  }
  if (riskScore.precipitation_probability >= 60) {
    factors.push(`Rain expected (${Math.round(riskScore.precipitation_probability)}% chance)`);
  }
  if (riskScore.lightning_risk >= 50) {
    factors.push("Lightning risk");
  }
  if (riskScore.hail_probability >= 40) {
    factors.push("Hail possible");
  }
  if (riskScore.temperature_f && riskScore.temperature_f < 40) {
    factors.push("Cold temperature - shingles may not seal properly");
  }
  if (riskScore.temperature_f && riskScore.temperature_f > 95) {
    factors.push("Extreme heat - exercise caution");
  }

  let message = `Weather warning for today's install:\n\n`;
  message += factors.join("\n") + "\n\n";

  if (severity === "critical") {
    message +=
      "⚠️ CRITICAL: Consider rescheduling or ensure crew has tarp plan ready.";
  } else {
    message += "⚠️ Crews should secure materials and exercise caution.";
  }

  return message;
}




































