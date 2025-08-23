import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ steps: {} }, { status: 401 });
    }

    // Get onboarding steps from the user's profile
    const { data } = await supabase
      .from("profiles")
      .select("onboarding")
      .eq("id", user.id)
      .maybeSingle();
    
    // Return the three specific steps we're tracking
    const steps = data?.onboarding || {};
    return NextResponse.json({ 
      steps: {
        import_contacts: steps.import_contacts || false,
        send_campaign: steps.send_campaign || false,
        upgrade: steps.upgrade || false
      }
    });
  } catch (error) {
    console.error("Error getting onboarding status:", error);
    return NextResponse.json({ steps: {} }, { status: 500 });
  }
} 