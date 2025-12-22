// Edge Function: Check weather forecast for scheduled jobs
// POST /functions/v1/schedule-weather-check

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");

interface WeatherCheckRequest {
  job_id: string;
  schedule_id?: string;
  date?: string; // YYYY-MM-DD, defaults to schedule start_date
  address?: string; // Job address for location
}

Deno.serve(async (req) => {
  try {
    const body: WeatherCheckRequest = await req.json();

    if (!body.job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get job and schedule details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, address, workspace_id")
      .eq("id", body.job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get schedule if provided
    let schedule = null;
    if (body.schedule_id) {
      const { data } = await supabase
        .from("crew_schedules")
        .select("id, start_date, end_date")
        .eq("id", body.schedule_id)
        .single();
      schedule = data;
    } else {
      // Get active schedule for job
      const { data } = await supabase
        .from("crew_schedules")
        .select("id, start_date, end_date")
        .eq("job_id", body.job_id)
        .in("status", ["scheduled", "in_progress"])
        .order("start_date", { ascending: true })
        .limit(1)
        .single();
      schedule = data;
    }

    const checkDate = body.date || schedule?.start_date || new Date().toISOString().split("T")[0];
    const address = body.address || job.address;

    if (!OPENWEATHER_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "OpenWeather API key not configured",
          warning: "Weather checking requires OPENWEATHER_API_KEY environment variable",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Geocode address to get lat/lon (simplified - in production use proper geocoding)
    // For now, we'll use a default location or require lat/lon
    // In production, integrate with Google Maps Geocoding API or similar

    // For MVP, we'll use a simple approach: if address contains a zip code, use that
    // Otherwise, return a mock response
    const zipMatch = address?.match(/\b\d{5}\b/);
    
    if (!zipMatch) {
      return new Response(
        JSON.stringify({
          error: "Unable to determine location from address. Please provide coordinates or a valid address with zip code.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call OpenWeather API (using zip code for simplicity)
    // In production, use proper geocoding first
    const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?zip=${zipMatch[0]},us&appid=${OPENWEATHER_API_KEY}&units=imperial`;
    
    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) {
      throw new Error(`OpenWeather API error: ${weatherResponse.statusText}`);
    }

    const weatherData = await weatherResponse.json();

    // Find forecast for the target date
    const targetDate = new Date(checkDate);
    const forecasts = weatherData.list || [];
    
    let relevantForecast = null;
    for (const forecast of forecasts) {
      const forecastDate = new Date(forecast.dt * 1000);
      if (forecastDate.toDateString() === targetDate.toDateString()) {
        relevantForecast = forecast;
        break;
      }
    }

    // If no exact match, use closest forecast
    if (!relevantForecast && forecasts.length > 0) {
      relevantForecast = forecasts[0];
    }

    if (!relevantForecast) {
      return new Response(
        JSON.stringify({ error: "No forecast data available for the specified date" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Analyze weather risk
    const weather = relevantForecast.weather[0];
    const main = relevantForecast.main;
    const wind = relevantForecast.wind || {};

    const precipitation = relevantForecast.rain?.["3h"] || relevantForecast.snow?.["3h"] || 0;
    const windSpeed = wind.speed || 0;
    const windGust = wind.gust || windSpeed;
    const tempHigh = main.temp_max || main.temp;
    const tempLow = main.temp_min || main.temp;

    // Determine risk level
    let risk_level = "low";
    const risk_reasons: string[] = [];

    if (weather.main === "Rain" || precipitation > 0.1) {
      risk_level = risk_level === "low" ? "medium" : risk_level;
      risk_reasons.push("rain");
    }

    if (windSpeed > 30 || windGust > 35) {
      risk_level = "high";
      risk_reasons.push(`wind > ${Math.round(windSpeed)}mph`);
    }

    if (weather.main === "Snow" || tempLow < 32) {
      risk_level = risk_level === "low" ? "medium" : risk_level;
      risk_reasons.push("snow/freezing");
    }

    if (precipitation > 0.5) {
      risk_level = "high";
    }

    if (windSpeed > 40 || windGust > 45) {
      risk_level = "critical";
    }

    // Determine recommended action
    let recommended_action = "proceed";
    let suggested_reschedule_date = null;

    if (risk_level === "critical" || risk_level === "high") {
      recommended_action = "reschedule";
      // Suggest next available date (3 days out)
      const rescheduleDate = new Date(targetDate);
      rescheduleDate.setDate(rescheduleDate.getDate() + 3);
      suggested_reschedule_date = rescheduleDate.toISOString().split("T")[0];
    } else if (risk_level === "medium") {
      recommended_action = "delay";
    }

    // Store forecast in database
    const forecastRecord = {
      workspace_id: job.workspace_id,
      job_id: body.job_id,
      schedule_id: schedule?.id || null,
      forecast_date: checkDate,
      forecast: relevantForecast,
      risk_level,
      risk_reasons,
      temperature_high: tempHigh,
      temperature_low: tempLow,
      precipitation_probability: relevantForecast.pop * 100 || 0,
      precipitation_amount: precipitation,
      wind_speed_max: windSpeed,
      wind_gust_max: windGust,
      snow_expected: weather.main === "Snow",
      recommended_action,
      suggested_reschedule_date,
    };

    const { data: savedForecast, error: saveError } = await supabase
      .from("weather_forecasts")
      .insert(forecastRecord)
      .select()
      .single();

    if (saveError) {
      console.error("Error saving forecast:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        forecast: savedForecast || forecastRecord,
        risk_level,
        risk_reasons,
        recommended_action,
        suggested_reschedule_date,
        weather_summary: {
          condition: weather.main,
          description: weather.description,
          temperature: `${Math.round(tempHigh)}°F / ${Math.round(tempLow)}°F`,
          wind: `${Math.round(windSpeed)}mph${windGust > windSpeed ? ` (gusts ${Math.round(windGust)}mph)` : ""}`,
          precipitation: precipitation > 0 ? `${precipitation.toFixed(2)} inches` : "none",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking weather:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































