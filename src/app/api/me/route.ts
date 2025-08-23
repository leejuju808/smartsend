import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's profile data
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("referral_code, referral_credits, subscription_status, team_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get team credit balance if user has a team
    let team_credit_balance = 0;
    if (profile?.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("credit_balance")
        .eq("id", profile.team_id)
        .maybeSingle();
      team_credit_balance = team?.credit_balance || 0;
    }

    return NextResponse.json({
      referral_code: profile?.referral_code,
      referral_credits: profile?.referral_credits || 0,
      subscription_status: profile?.subscription_status,
      team_credit_balance
    });

  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 