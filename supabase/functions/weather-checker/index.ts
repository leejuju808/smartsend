// Block 252700 — SmartSend Real-Time Weather Intelligence Engine
// Edge Function: /weather-checker
// 
// Runs every hour via cron
// Steps:
// 1. Pull all active jobs
// 2. Get job GPS coordinates
// 3. Query weather API
// 4. Store forecast
// 5. Trigger alerts if needed
//
// This makes SmartSend constantly aware of risk.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openWeatherApiKey = Deno.env.get("OPENWEATHER_API_KEY") || Deno.env.get("WEATHER_API_KEY");
const tomorrowIoApiKey = Deno.env.get("TOMORROW_IO_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WeatherForecastHour {
  datetime: string;
  precipitation_probability: number;
  wind_speed_mph: number;
  wind_gusts_mph: number;
  temperature_f: number;
  humidity_percent: number;
  lightning_risk: number;
  hail_probability: number;
  condition: string;
}

interface JobLocation {
  job_id: string;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!openWeatherApiKey && !tomorrowIoApiKey) {
      return new Response(
        JSON.stringify({ error: "No weather API key configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active jobs with GPS coordinates
    const { data: activeJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, site_lat, site_lng, address, production_date, scheduled_start_date, company_id")
      .not("site_lat", "is", null)
      .not("site_lng", "is", null)
      .in("stage", ["scheduled", "in_progress"])
      .or("production_date.gte.now(),scheduled_start_date.gte.now()");

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return new Response(
        JSON.stringify({ error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!activeJobs || activeJobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No active jobs to process" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;
    const alerts: Array<{ job_id: string; alert: string }> = [];

    // Process each job
    for (const job of activeJobs) {
      try {
        const location: JobLocation = {
          job_id: job.id,
          lat: job.site_lat,
          lng: job.site_lng,
          address: job.address,
        };

        // Fetch weather forecast
        const forecast = await fetchWeatherForecast(location, openWeatherApiKey || tomorrowIoApiKey || "");

        if (!forecast || forecast.length === 0) {
          console.warn(`No forecast for job ${job.id}`);
          continue;
        }

        // Calculate heat index and evaluate rules
        const processedForecast = forecast.map((hour) => {
          const heatIndex = calculateHeatIndex(hour.temperature_f, hour.humidity_percent);
          return {
            ...hour,
            heat_index_f: heatIndex,
            osha_alert: getOSHAAlertLevel(heatIndex),
          };
        });

        // Store forecast in job_weather_status
        const { error: statusError } = await supabase
          .from("job_weather_status")
          .upsert(
            {
              job_id: job.id,
              forecast: {
                hourly: processedForecast,
                daily: aggregateDailyForecast(processedForecast),
                updated_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
              weather_provider: openWeatherApiKey ? "openweather" : "tomorrow_io",
            },
            { onConflict: "job_id" }
          );

        if (statusError) {
          console.error(`Error storing weather status for job ${job.id}:`, statusError);
          errors++;
          continue;
        }

        // Evaluate weather rules
        const { data: rulesResult } = await supabase.rpc("evaluate_weather_rules", {
          p_job_id: job.id,
          p_forecast_data: {
            hourly: processedForecast,
          },
        });

        if (rulesResult && rulesResult.events && rulesResult.events.length > 0) {
          // Trigger events
          for (const event of rulesResult.events) {
            await supabase.rpc("trigger_weather_event", {
              p_job_id: job.id,
              p_event_type: event.event_type,
              p_message: event.message,
              p_severity: event.severity,
              p_metadata: event,
            });

            alerts.push({
              job_id: job.id,
              alert: event.message,
            });

            // Auto-reschedule if severity is high and action is auto-reschedule
            if (
              event.severity === "high" &&
              event.action === "auto-reschedule" &&
              event.event_type === "rain_alert"
            ) {
              await supabase.rpc("auto_reschedule_for_weather", {
                p_job_id: job.id,
                p_reason: event.message,
              });
            }
          }
        }

        // Calculate overall risk level
        const maxRisk = Math.max(
          ...processedForecast.map((h) => {
            let risk = 0;
            if (h.precipitation_probability >= 60) risk = 70;
            if (h.wind_speed_mph >= 35) risk = 80;
            if (h.heat_index_f && h.heat_index_f >= 103) risk = 75;
            if (h.hail_probability >= 40) risk = 90;
            return risk;
          })
        );

        const riskLevel = maxRisk >= 70 ? "high_risk" : maxRisk >= 40 ? "caution" : "normal";

        // Update job_weather_status risk level
        await supabase
          .from("job_weather_status")
          .update({
            risk_level: riskLevel,
            current_risk_score: maxRisk,
            current_heat_index_f: processedForecast[0]?.heat_index_f || null,
            current_wind_speed_mph: processedForecast[0]?.wind_speed_mph || null,
            current_rain_probability: processedForecast[0]?.precipitation_probability || null,
            next_48h_max_risk_score: maxRisk,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", job.id);

        processed++;
      } catch (error: any) {
        console.error(`Error processing job ${job.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        alerts_count: alerts.length,
        alerts: alerts.slice(0, 10), // First 10 alerts
        message: `Processed ${processed} jobs, ${errors} errors, ${alerts.length} alerts triggered`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Weather checker error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Fetch weather forecast from OpenWeather or Tomorrow.io
 */
async function fetchWeatherForecast(
  location: JobLocation,
  apiKey: string
): Promise<WeatherForecastHour[]> {
  if (tomorrowIoApiKey) {
    return fetchTomorrowIoForecast(location, apiKey);
  } else {
    return fetchOpenWeatherForecast(location, apiKey);
  }
}

/**
 * Fetch from OpenWeather API
 */
async function fetchOpenWeatherForecast(
  location: JobLocation,
  apiKey: string
): Promise<WeatherForecastHour[]> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${location.lat}&lon=${location.lng}&appid=${apiKey}&units=imperial`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OpenWeather API error: ${response.statusText}`);
  }

  const data = await response.json();
  const forecast: WeatherForecastHour[] = [];

  if (data.list) {
    for (const item of data.list) {
      const datetime = new Date(item.dt * 1000);
      forecast.push({
        datetime: datetime.toISOString(),
        precipitation_probability: (item.pop || 0) * 100,
        wind_speed_mph: item.wind?.speed || 0,
        wind_gusts_mph: item.wind?.gust || 0,
        temperature_f: item.main?.temp || 0,
        humidity_percent: item.main?.humidity || 50,
        lightning_risk: item.weather?.[0]?.main === "Thunderstorm" ? 70 : 0,
        hail_probability: item.weather?.[0]?.description?.toLowerCase().includes("hail") ? 50 : 0,
        condition: item.weather?.[0]?.main || "Clear",
      });
    }
  }

  return forecast;
}

/**
 * Fetch from Tomorrow.io API
 */
async function fetchTomorrowIoForecast(
  location: JobLocation,
  apiKey: string
): Promise<WeatherForecastHour[]> {
  const url = `https://api.tomorrow.io/v4/timelines?location=${location.lat},${location.lng}&fields=temperature,humidity,precipitationProbability,windSpeed,windGust,weatherCode&timesteps=1h&units=imperial&apikey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Tomorrow.io API error: ${response.statusText}`);
  }

  const data = await response.json();
  const forecast: WeatherForecastHour[] = [];

  if (data.data?.timelines?.[0]?.intervals) {
    for (const interval of data.data.timelines[0].intervals) {
      const values = interval.values;
      const datetime = new Date(interval.startTime);
      forecast.push({
        datetime: datetime.toISOString(),
        precipitation_probability: values.precipitationProbability || 0,
        wind_speed_mph: values.windSpeed || 0,
        wind_gusts_mph: values.windGust || 0,
        temperature_f: values.temperature || 0,
        humidity_percent: values.humidity || 50,
        lightning_risk: values.weatherCode >= 2000 && values.weatherCode < 3000 ? 70 : 0,
        hail_probability: values.weatherCode >= 7000 && values.weatherCode < 8000 ? 50 : 0,
        condition: getConditionFromCode(values.weatherCode),
      });
    }
  }

  return forecast;
}

function getConditionFromCode(code: number): string {
  if (code >= 2000 && code < 3000) return "Thunderstorm";
  if (code >= 4000 && code < 5000) return "Rain";
  if (code >= 5000 && code < 6000) return "Snow";
  if (code >= 7000 && code < 8000) return "Hail";
  return "Clear";
}

/**
 * Calculate heat index using the Rothfusz equation
 */
function calculateHeatIndex(tempF: number, humidity: number): number {
  if (tempF < 80) {
    return tempF; // Below 80°F, heat index equals temperature
  }

  const T = tempF;
  const R = humidity;

  const HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    6.83783e-3 * T * T -
    5.481717e-2 * R * R +
    1.22874e-3 * T * T * R +
    8.5282e-4 * T * R * R -
    1.99e-6 * T * T * R * R;

  return Math.round(HI * 100) / 100;
}

/**
 * Get OSHA alert level from heat index
 */
function getOSHAAlertLevel(heatIndex: number): {
  level: string;
  message: string;
  actions: string[];
} {
  if (heatIndex >= 110) {
    return {
      level: "stop_work",
      message: `⚠️ OSHA HEAT ALERT - Heat Index ${heatIndex}°F - STOP WORK CONDITIONS`,
      actions: ["STOP ALL WORK", "Seek immediate shade", "Hydrate", "Contact supervisor"],
    };
  } else if (heatIndex >= 103) {
    return {
      level: "mandatory_breaks",
      message: `⚠️ OSHA HEAT ALERT - Heat Index ${heatIndex}°F - Mandatory shade + rotation`,
      actions: [
        "Mandatory 15-minute breaks every hour",
        "Work in shade when possible",
        "Rotate heavy work",
        "Frequent hydration",
      ],
    };
  } else if (heatIndex >= 90) {
    return {
      level: "frequent_breaks",
      message: `⚠️ OSHA HEAT ALERT - Heat Index ${heatIndex}°F - Frequent water breaks required`,
      actions: [
        "Frequent water breaks",
        "Monitor for heat stress symptoms",
        "Limit heavy work in direct sun",
      ],
    };
  }
  return {
    level: "normal",
    message: `Heat Index ${heatIndex}°F - Normal working conditions`,
    actions: [],
  };
}

/**
 * Aggregate hourly forecast into daily summary
 */
function aggregateDailyForecast(hourly: WeatherForecastHour[]): any {
  if (hourly.length === 0) return {};

  const maxTemp = Math.max(...hourly.map((h) => h.temperature_f));
  const minTemp = Math.min(...hourly.map((h) => h.temperature_f));
  const maxRainProb = Math.max(...hourly.map((h) => h.precipitation_probability));
  const maxWind = Math.max(...hourly.map((h) => h.wind_speed_mph));
  const maxWindGust = Math.max(...hourly.map((h) => h.wind_gusts_mph));

  return {
    max_temp: maxTemp,
    min_temp: minTemp,
    precipitation_probability: maxRainProb,
    wind_speed_mph: maxWind,
    wind_gusts_mph: maxWindGust,
  };
}
























