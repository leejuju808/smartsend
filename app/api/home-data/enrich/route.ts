// Block 96000 — Auto-Personalization Engine v1: Home Data Enrichment API
// Proxies requests to the enrichHomeData edge function

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(req: NextRequest) {
  try {
    const { address, city, state, zip } = await req.json();

    if (!address) {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL) {
      return NextResponse.json(
        { error: "Supabase URL not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Call the edge function
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/enrichHomeData`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ address, city, state, zip }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to enrich home data", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Home data enrichment error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























