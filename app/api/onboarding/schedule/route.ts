// Block 23650 — SmartSend Onboarding Email + SMS Pack v1
// API endpoint to manually schedule onboarding sequence for a user

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Schedule onboarding sequence
    const { error: scheduleError } = await supabase.rpc(
      "schedule_onboarding_sequence",
      { p_user_id: userId }
    );

    if (scheduleError) {
      console.error("Error scheduling onboarding:", scheduleError);
      return NextResponse.json(
        { error: scheduleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding sequence scheduled successfully",
      userId,
    });
  } catch (error: any) {
    console.error("Error in schedule onboarding:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































