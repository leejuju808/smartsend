import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    const { workspace_id } = gate;

    const body = await req.json();
    const { period_start, period_end } = body;

    if (!period_start || !period_end) {
      return NextResponse.json(
        { error: "Missing period_start or period_end" },
        { status: 400 }
      );
    }

    // Call the edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/compute-company-scorecard`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        workspace_id,
        period_start,
        period_end,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: errorText || "Failed to compute scorecard" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error computing company scorecard:", error);
    return NextResponse.json(
      { error: error.message || "Failed to compute scorecard" },
      { status: 500 }
    );
  }
}









































