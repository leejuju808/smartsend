// Block 21958 — SmartSend Roofing Estimator Performance Score v1
// API route to fetch estimator performance scores

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const estimator_id = searchParams.get("estimator_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from("estimator_performance")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("performance_score", { ascending: false });

    if (estimator_id) {
      query = query.eq("estimator_id", estimator_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching estimator performance:", error);
      return NextResponse.json(
        { error: "Failed to fetch performance scores" },
        { status: 500 }
      );
    }

    return NextResponse.json({ scores: data || [] });
  } catch (error) {
    console.error("Error in estimator performance API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspace_id, estimator_id } = await req.json();

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Call the edge function to calculate performance
    const edgeFunctionUrl = supabaseUrl.replace(
      ".supabase.co",
      ".functions.supabase.co"
    );

    const response = await fetch(
      `${edgeFunctionUrl}/calculate-estimator-performance`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          workspace_id,
          estimator_id,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error calling edge function:", errorText);
      return NextResponse.json(
        { error: "Failed to calculate performance scores" },
        { status: 500 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in estimator performance calculation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









































