// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/weather/check
// Check weather for job and suggest delays if needed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { job_id, date } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, address, scheduled_start_date")
      .eq("id", job_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const checkDate = date || job.scheduled_start_date || new Date().toISOString().split('T')[0];

    // Fetch weather data (using OpenWeather API or similar)
    const weatherData = await fetchWeatherForJob(job.address, checkDate);

    // Determine if delay is required
    const delayRequired = shouldDelayJob(weatherData);
    const riskLevel = calculateWeatherRisk(weatherData);

    // Save weather log
    const { data: weatherLog, error: logError } = await supabase
      .from("weather_log")
      .upsert({
        workspace_id: workspaceId,
        job_id,
        date: checkDate,
        location_address: job.address,
        weather: weatherData,
        temperature_high: weatherData.temp_high,
        temperature_low: weatherData.temp_low,
        precipitation_probability: weatherData.precipitation_probability,
        precipitation_amount: weatherData.precipitation_amount,
        wind_speed_mph: weatherData.wind_speed,
        conditions: weatherData.conditions,
        delay_required: delayRequired,
        delay_reason: delayRequired ? getDelayReason(weatherData) : null,
        weather_risk_level: riskLevel,
      }, {
        onConflict: "job_id,date",
      })
      .select()
      .single();

    if (logError) {
      console.error("Error saving weather log:", logError);
    }

    return NextResponse.json({
      weather: weatherData,
      delay_required: delayRequired,
      risk_level: riskLevel,
      recommendation: delayRequired 
        ? `Delay recommended: ${getDelayReason(weatherData)}`
        : "Weather conditions are acceptable",
      weather_log: weatherLog,
    });
  } catch (error: any) {
    console.error("Error in weather check:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Weather API Integration (OpenWeather or similar)
async function fetchWeatherForJob(address: string, date: string): Promise<any> {
  // This is a placeholder. In production, integrate with OpenWeather API or NOAA
  // For now, return mock data
  
  // In production, you would:
  // 1. Geocode the address to get lat/lng
  // 2. Call OpenWeather API: https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={API_KEY}
  // 3. Parse the response and extract relevant data

  return {
    temp_high: 72,
    temp_low: 55,
    precipitation_probability: 20,
    precipitation_amount: 0,
    wind_speed: 8,
    conditions: "partly_cloudy",
    description: "Partly cloudy with light winds",
  };
}

function shouldDelayJob(weatherData: any): boolean {
  // Delay if:
  // - Precipitation probability > 50%
  // - Precipitation amount > 0.1 inches
  // - Wind speed > 25 mph
  // - Temperature < 32°F (freezing)

  if (weatherData.precipitation_probability > 50) return true;
  if (weatherData.precipitation_amount > 0.1) return true;
  if (weatherData.wind_speed > 25) return true;
  if (weatherData.temp_low < 32) return true;

  return false;
}

function calculateWeatherRisk(weatherData: any): string {
  let riskScore = 0;

  if (weatherData.precipitation_probability > 70) riskScore += 3;
  else if (weatherData.precipitation_probability > 40) riskScore += 2;
  else if (weatherData.precipitation_probability > 20) riskScore += 1;

  if (weatherData.precipitation_amount > 0.5) riskScore += 3;
  else if (weatherData.precipitation_amount > 0.2) riskScore += 2;
  else if (weatherData.precipitation_amount > 0.1) riskScore += 1;

  if (weatherData.wind_speed > 30) riskScore += 3;
  else if (weatherData.wind_speed > 20) riskScore += 2;
  else if (weatherData.wind_speed > 15) riskScore += 1;

  if (weatherData.temp_low < 32) riskScore += 2;

  if (riskScore >= 6) return "severe";
  if (riskScore >= 4) return "high";
  if (riskScore >= 2) return "medium";
  return "low";
}

function getDelayReason(weatherData: any): string {
  const reasons = [];

  if (weatherData.precipitation_probability > 50) {
    reasons.push(`High rain probability (${weatherData.precipitation_probability}%)`);
  }
  if (weatherData.precipitation_amount > 0.1) {
    reasons.push(`Expected rainfall (${weatherData.precipitation_amount}")`);
  }
  if (weatherData.wind_speed > 25) {
    reasons.push(`High winds (${weatherData.wind_speed} mph)`);
  }
  if (weatherData.temp_low < 32) {
    reasons.push(`Freezing temperatures (${weatherData.temp_low}°F)`);
  }

  return reasons.join(", ") || "Unfavorable weather conditions";
}

























