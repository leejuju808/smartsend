// Block 40210 — Storm Damage Classification API
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, lead_id, storm_event_id } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/storm-damage-classify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          message,
          lead_id,
          storm_event_id,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge function error: ${error}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/storm/classify:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































