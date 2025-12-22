// Block 21744 — Hot Lead Accelerator v1
// API Route: /api/hot-leads/speed
// Returns speed-to-lead metrics for hot leads

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") || 7);

  const { data, error } = await supabase.rpc("hot_lead_speed_summary", {
    p_days: days,
  });

  if (error) {
    console.error("Failed to get hot lead speed summary:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}










































