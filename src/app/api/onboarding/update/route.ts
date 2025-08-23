import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { step } = await request.json();
    
    if (!step || !['import_contacts', 'send_campaign', 'upgrade'].includes(step)) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    // Update the onboarding step using the RPC function
    const { data, error } = await supabase.rpc('merge_onboarding_step', {
      uid: user.id,
      k: step
    });

    if (error) {
      console.error("Error updating onboarding step:", error);
      return NextResponse.json({ error: "Failed to update step" }, { status: 500 });
    }

    return NextResponse.json({ success: true, steps: data });
  } catch (error) {
    console.error("Error updating onboarding step:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 