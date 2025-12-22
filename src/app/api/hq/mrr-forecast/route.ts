import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      scope = 'global',
      app,
      months = 12,
      growth_pct = 0.08,
      churn_pct = 0.03,
      expansion_pct = 0.02,
      arpa_growth_pct = 0.0,
    } = body;

    // Call the Supabase Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/mrr_forecast`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        scope,
        app,
        months,
        growth_pct,
        churn_pct,
        expansion_pct,
        arpa_growth_pct,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MRR forecast function error:", errorText);
      return NextResponse.json(
        { error: "Forecast function failed", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("MRR forecast API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

