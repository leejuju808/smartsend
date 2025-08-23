import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the step to complete from the request body
    const { step } = await req.json();
    if (!step) {
      return NextResponse.json({ error: "Step is required" }, { status: 400 });
    }

    // Mark the step as complete using the RPC function
    const { data, error } = await supabase.rpc("merge_onboarding_step", {
      uid: user.id,
      k: step,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true, onboarding: data });
  } catch (error) {
    console.error("Error completing onboarding step:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 