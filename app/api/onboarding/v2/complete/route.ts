// Block 16800 — SmartSend Trials & Onboarding v2
// POST /api/onboarding/v2/complete - Mark onboarding as complete

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mark onboarding as complete
  const { data: progress, error } = await supabase
    .from("onboarding_progress")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record completion event
  await supabase.from("trial_events").insert({
    user_id: user.id,
    account_id: progress?.account_id,
    event_type: "first_48h_win",
    event_data: { onboarding_completed: true },
  });

  return NextResponse.json({ progress, completed: true });
}





















































