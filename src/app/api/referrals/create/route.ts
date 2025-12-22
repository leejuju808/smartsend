import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/referrals/create
 * Create a referral link for the authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate unique referral code
    const referralCode = `REF-${user.id.slice(0, 8).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://smartsend.ai";
    const referralUrl = `${appUrl}/signup?ref=${referralCode}`;

    // Check if user already has a referral code (from affiliates table or create new)
    const { data: existingAffiliate } = await supabaseAdmin
      .from("affiliates")
      .select("id, referral_code")
      .eq("user_id", user.id)
      .maybeSingle();

    let finalReferralCode = referralCode;
    if (existingAffiliate) {
      finalReferralCode = existingAffiliate.referral_code;
    } else {
      // Create affiliate record if doesn't exist
      await supabaseAdmin.from("affiliates").insert({
        user_id: user.id,
        referral_code: finalReferralCode,
        referral_url: referralUrl,
      });
    }

    return NextResponse.json({
      success: true,
      referral_code: finalReferralCode,
      referral_url: referralUrl,
    });
  } catch (error: any) {
    console.error("Referral creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
