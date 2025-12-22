// Block 21856 — SmartSend Roofing Revenue Forecast Engine v1
// API route to compute revenue forecast for a workspace

import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let workspaceId = body.workspace_id;

    // Get workspace ID from body or current workspace
    if (!workspaceId) {
      workspaceId = await getCurrentWorkspaceId();
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Call the edge function to compute forecast
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/compute-revenue-forecast`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Error calling compute-revenue-forecast:", error);
      return NextResponse.json(
        { error: "Failed to compute forecast" },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      forecast: result.forecast,
    });
  } catch (error: any) {
    console.error("Revenue forecast compute API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

