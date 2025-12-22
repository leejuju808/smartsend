// Block 21878 — API Route for Daily Command Center
// Proxies request to Supabase Edge Function

import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_FUNCTIONS_URL = SUPABASE_URL?.replace(/\.supabase\.co$/, ".functions.supabase.co");

export async function POST(req: NextRequest) {
  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required parameter: workspace_id" },
        { status: 400 }
      );
    }

    if (!SUPABASE_FUNCTIONS_URL) {
      return NextResponse.json(
        { error: "Supabase functions URL not configured" },
        { status: 500 }
      );
    }

    // Call the Supabase Edge Function
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-daily-command-center`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ workspace_id }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Edge function error:", error);
      return NextResponse.json(
        { error: "Failed to fetch command center data" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Command center API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}









































