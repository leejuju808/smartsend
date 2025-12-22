// Block 21734 — SmartSend Roofing Call Queue v1
// GET /api/call-queue
// Fetch prioritized call queue for estimators

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 50);

  const { data, error } = await supabase
    .from("call_tasks")
    .select(
      `
      id,
      lead_id,
      status,
      priority,
      due_at,
      source,
      notes,
      leads (
        name,
        first_name,
        last_name,
        email,
        phone,
        city,
        status,
        heat_score
      )
    `
    )
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .order("priority", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Call queue fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

