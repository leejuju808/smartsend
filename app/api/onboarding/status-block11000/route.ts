// Block 11000 — Get Onboarding Status API
// GET /api/onboarding/status-block11000

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        step_1_done: false,
        step_2_done: false,
        step_3_done: false,
        step_4_done: false,
        completed: false,
      },
      { status: 200 }
    );
  }

  try {
    // Get or create onboarding status
    const { data: status, error } = await supabase.rpc(
      "get_or_create_onboarding_status",
      {
        p_user_id: user.id,
      }
    );

    if (error) {
      // If function doesn't exist or fails, try direct query
      const { data: directStatus } = await supabase
        .from("onboarding_status")
        .select()
        .eq("user_id", user.id)
        .single();

      if (directStatus) {
        return NextResponse.json({
          step_1_done: directStatus.step_1_done,
          step_2_done: directStatus.step_2_done,
          step_3_done: directStatus.step_3_done,
          step_4_done: directStatus.step_4_done,
          completed: !!directStatus.completed_at,
        });
      }

      // Return default if no status found
      return NextResponse.json({
        step_1_done: false,
        step_2_done: false,
        step_3_done: false,
        step_4_done: false,
        completed: false,
      });
    }

    return NextResponse.json({
      step_1_done: status?.step_1_done || false,
      step_2_done: status?.step_2_done || false,
      step_3_done: status?.step_3_done || false,
      step_4_done: status?.step_4_done || false,
      completed: !!status?.completed_at,
    });
  } catch (error: any) {
    console.error("Error getting onboarding status:", error);
    return NextResponse.json(
      {
        step_1_done: false,
        step_2_done: false,
        step_3_done: false,
        step_4_done: false,
        completed: false,
      },
      { status: 200 }
    );
  }
}























































