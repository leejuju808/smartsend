import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from("billing_global_guard")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const status = computeStatus(data);

    return NextResponse.json({
      guard: status,
      raw: data,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Guard check failed" }, { status: 500 });
  }
}

function computeStatus(g: any): string {
  // Hard stop: Seat limit exceeded
  if (g.seats_over_cap) {
    return "blocked_seat_limit";
  }

  // Hard stop: Daily send cap exceeded AND no credits
  if (g.sends_over_cap && g.credits_empty) {
    return "blocked_sends_no_credits";
  }

  // Fallback mode: Daily cap exceeded but credits available
  if (g.sends_over_cap && g.credits > 0) {
    return "fallback_credit_sends";
  }

  // Soft degraded: Credits empty but plan still under limits
  if (g.credits_empty && !g.sends_over_cap) {
    return "low_credits";
  }

  // All good
  return "ok";
}








