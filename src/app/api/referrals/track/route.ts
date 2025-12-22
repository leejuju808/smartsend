import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/referrals/track
 * Track a referral event (signup, conversion, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    const { referral_code, event_type, metadata } = await req.json();

    if (!referral_code || !event_type) {
      return NextResponse.json(
        { error: "referral_code and event_type required" },
        { status: 400 }
      );
    }

    // Find referrer by code
    const { data: affiliate } = await supabaseAdmin
      .from("affiliates")
      .select("id, user_id")
      .eq("referral_code", referral_code)
      .single();

    if (!affiliate) {
      return NextResponse.json(
        { error: "Invalid referral code" },
        { status: 404 }
      );
    }

    // Get current user if authenticated
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Record referral event
    const referralData: any = {
      referrer_id: affiliate.user_id,
      referral_code,
      status: event_type === "subscription" ? "converted" : event_type === "signup" ? "signed_up" : "pending",
      conversion_event: event_type,
      metadata: metadata || {},
    };

    if (user) {
      referralData.referred_user_id = user.id;
      referralData.referred_email = user.email;
    } else if (metadata?.email) {
      referralData.referred_email = metadata.email;
    }

    const { data: referral, error: insertError } = await supabaseAdmin
      .from("referrals")
      .insert(referralData)
      .select()
      .single();

    if (insertError) {
      console.error("Error creating referral:", insertError);
      return NextResponse.json(
        { error: "Failed to track referral" },
        { status: 500 }
      );
    }

    // Calculate and record reward if conversion
    if (event_type === "subscription" && metadata?.subscription_id) {
      // Reward logic: $10 for conversion
      const rewardCents = 1000; // $10.00

      await supabaseAdmin.from("referral_rewards").insert({
        referral_id: referral.id,
        amount_cents: rewardCents,
        reward_type: "conversion_bonus",
        status: "pending",
      });

      // Update affiliate totals
      await supabaseAdmin.rpc("increment_affiliate_count", {
        aid: affiliate.id,
      });
    }

    return NextResponse.json({
      success: true,
      referral_id: referral.id,
    });
  } catch (error: any) {
    console.error("Referral tracking error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

