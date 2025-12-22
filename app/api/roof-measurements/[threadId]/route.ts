// Block 19950 — SmartSend Roof Measurement API
// GET /api/roof-measurements/[threadId]
// Fetches roof measurement data for a thread

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = params;

    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Get roof measurement for this thread
    const { data: measurement, error } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("thread_id", threadId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching roof measurement:", error);
      return NextResponse.json({ error: "Failed to fetch measurement" }, { status: 500 });
    }

    return NextResponse.json({
      measurement: measurement || null,
    });
  } catch (error: any) {
    console.error("Error in roof measurement API:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch roof measurement" },
      { status: 500 }
    );
  }
}



















































