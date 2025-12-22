// Block 21675 — Onboarding State API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: state, error } = await supabase
    .from("onboarding_state")
    .select("current_step, completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching onboarding state:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding state" },
      { status: 500 }
    );
  }

  // If no state exists, return default
  if (!state) {
    return NextResponse.json({
      current_step: "welcome",
      completed: false,
    });
  }

  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { current_step, completed } = body;

  // Upsert onboarding state
  const { data, error } = await supabase
    .from("onboarding_state")
    .upsert(
      {
        user_id: user.id,
        current_step: current_step || "welcome",
        completed: completed || false,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("Error updating onboarding state:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding state" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
