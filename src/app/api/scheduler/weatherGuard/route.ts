import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/weatherGuard
 * Check weather conditions for a time slot and location
 * Body:
 * {
 *   date: YYYY-MM-DD (required)
 *   time_start: HH:MM (required)
 *   time_end: HH:MM (required)
 *   location_address?: string
 *   location_zip?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();
    const supabaseAdmin = createServiceClient();

    const body = await req.json();
    const { date, time_start, time_end, location_address, location_zip } = body;

    if (!date || !time_start || !time_end) {
      return NextResponse.json(
        { error: "date, time_start, and time_end are required" },
        { status: 400 }
      );
    }

    // Get scheduler settings
    const { data: settings } = await supabase
      .from("scheduler_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (!settings) {
      return NextResponse.json(
        { error: "Scheduler settings not found" },
        { status: 404 }
      );
    }

    // Check existing weather blocks
    const { data: weatherBlocks } = await supabaseAdmin
      .from("weather_blocks")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("blocked_date", date)
      .lte("blocked_time_start", time_end)
      .gte("blocked_time_end", time_start);

    if (weatherBlocks && weatherBlocks.length > 0) {
      const block = weatherBlocks[0];
      return NextResponse.json({
        safe: false,
        blocked: true,
        reason: formatWeatherReason(block),
        weather_type: block.weather_type,
        weather_intensity: block.weather_intensity,
        wind_speed_mph: block.wind_speed_mph,
        precipitation_inches: block.precipitation_inches,
      });
    }

    // TODO: Check real-time weather API
    // For now, return safe (no weather data)
    // In production, integrate with OpenWeatherMap, WeatherAPI, or similar
    
    // Example integration:
    // const weatherData = await checkWeatherAPI(location_zip || location_address, date, time_start);
    // if (weatherData.rain && settings.block_rain) {
    //   return { safe: false, reason: "Rain expected" };
    // }
    // if (weatherData.wind_speed > settings.high_wind_threshold_mph && settings.block_high_wind) {
    //   return { safe: false, reason: `High winds expected (${weatherData.wind_speed} mph)` };
    // }

    return NextResponse.json({
      safe: true,
      blocked: false,
      reason: null,
      note: "Weather check passed (no weather data available - integrate weather API for production)",
    });
  } catch (error: any) {
    console.error("Error in weatherGuard endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scheduler/weatherGuard
 * Get weather blocks for a date range
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - location_address?: string
 * - location_zip?: string
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const searchParams = req.nextUrl.searchParams;
    const date = searchParams.get("date");
    const locationAddress = searchParams.get("location_address");
    const locationZip = searchParams.get("location_zip");

    if (!date) {
      return NextResponse.json(
        { error: "date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("weather_blocks")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("blocked_date", date)
      .order("blocked_time_start", { ascending: true });

    if (locationAddress) {
      query = query.or(`location_address.eq.${locationAddress},location_address.is.null`);
    }

    if (locationZip) {
      query = query.or(`location_zip.eq.${locationZip},location_zip.is.null`);
    }

    const { data: blocks, error } = await query;

    if (error) {
      console.error("Error fetching weather blocks:", error);
      return NextResponse.json(
        { error: "Failed to fetch weather blocks", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      date,
      blocks: blocks || [],
    });
  } catch (error: any) {
    console.error("Error in weatherGuard GET endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function formatWeatherReason(block: any): string {
  const parts: string[] = [];
  
  if (block.weather_type) {
    parts.push(block.weather_type);
  }
  
  if (block.wind_speed_mph) {
    parts.push(`${block.wind_speed_mph}mph winds`);
  }
  
  if (block.precipitation_inches) {
    parts.push(`${block.precipitation_inches}" precipitation`);
  }
  
  return parts.length > 0 ? parts.join(", ") : "Unsafe weather conditions";
}





















































