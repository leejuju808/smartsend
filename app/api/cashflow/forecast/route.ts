// Block 26110 — SmartSend Roofing Cashflow Forecast v1
// API route to fetch cashflow forecast for a workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspace_id");
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 90;

    // Validate days
    if (![30, 60, 90].includes(days)) {
      return NextResponse.json(
        { error: "Days must be 30, 60, or 90" },
        { status: 400 }
      );
    }

    // Get workspace ID from param or current workspace
    let workspaceId = workspaceIdParam;
    if (!workspaceId) {
      workspaceId = await getCurrentWorkspaceId();
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Call the edge function to get forecast
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    // Build URL with query params
    const functionUrl = `${supabaseUrl}/functions/v1/forecast-cashflow`;
    const url = new URL(functionUrl);
    url.searchParams.set("workspace_id", workspaceId);
    url.searchParams.set("days", days.toString());

    const forecastResponse = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!forecastResponse.ok) {
      const error = await forecastResponse.text();
      console.error("Error calling forecast-cashflow:", error);
      return NextResponse.json(
        { error: "Failed to get cashflow forecast" },
        { status: forecastResponse.status }
      );
    }

    const result = await forecastResponse.json();

    return NextResponse.json({
      ok: true,
      forecast: result,
    });
  } catch (error: any) {
    console.error("Cashflow forecast API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































