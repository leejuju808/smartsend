// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// API Route: Classify Proposal Intent
// Proxies request to Edge Function for AI classification

import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_FUNCTIONS_URL = SUPABASE_URL?.replace(/\.supabase\.co$/, ".functions.supabase.co");

export async function POST(req: NextRequest) {
  try {
    const { proposal_id, lead_id, workspace_id, message } = await req.json();

    if (!proposal_id || !lead_id || !workspace_id || !message) {
      return NextResponse.json(
        { error: "proposal_id, lead_id, workspace_id, and message are required" },
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
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/classify-proposal-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        proposal_id,
        lead_id,
        workspace_id,
        message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Edge function error:", error);
      return NextResponse.json(
        { error: "Failed to classify proposal intent" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Classify intent API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}








































