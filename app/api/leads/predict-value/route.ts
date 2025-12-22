// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// API Route: Predict Lead Value

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { lead_id, workspace_id } = await req.json();

    if (!lead_id) {
      return NextResponse.json(
        { error: "Missing required field: lead_id" },
        { status: 400 }
      );
    }

    // Get Supabase URL and service role key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Call the Edge Function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/predict-lead-value`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ lead_id, workspace_id }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: error.error || "Failed to generate prediction" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in predict-value route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























