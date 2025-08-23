import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's referral credits
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("referral_credits")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.referral_credits || profile.referral_credits <= 0) {
      return NextResponse.json({ error: "No credits available" }, { status: 400 });
    }

    // Apply credits - extend trial by 7 days or add to usage balance
    // For now, we'll just reset the credits to 0
    // You can implement the actual credit application logic here
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ referral_credits: 0 })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to redeem credits" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Credits redeemed successfully",
      creditsRedeemed: profile.referral_credits
    });

  } catch (error) {
    console.error("Error redeeming referral credits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 