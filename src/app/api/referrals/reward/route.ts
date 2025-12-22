import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  try {
    const { new_user_id, new_user_email } = await req.json();

    if (!new_user_id || !new_user_email) {
      return NextResponse.json(
        { ok: false, reason: "missing_params" },
        { status: 400 }
      );
    }

    // Find pending referral for this email
    const { data: referral, error: referralError } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .eq("referred_email", new_user_email.toLowerCase())
      .eq("status", "pending")
      .maybeSingle();

    if (referralError || !referral) {
      return NextResponse.json({ ok: false, reason: "no_referral" });
    }

    // Update referral with user ID, set status to activated, and set reward amount
    const rewardAmount = 10; // $10 reward
    const { error: updateError } = await supabaseAdmin
      .from("referrals")
      .update({
        referred_user_id: new_user_id,
        status: "activated",
        reward_amount: rewardAmount,
      })
      .eq("id", referral.id);

    if (updateError) {
      console.error("Error updating referral:", updateError);
      return NextResponse.json(
        { ok: false, reason: "update_failed" },
        { status: 500 }
      );
    }

    // Increment referrer's credit using the RPC function
    const { error: creditError } = await supabaseAdmin.rpc("increment_user_credit", {
      user_id: referral.referrer_id,
      amount: rewardAmount,
    });

    if (creditError) {
      console.error("Error incrementing credit:", creditError);
      // Don't fail the whole request if credit increment fails
      // The referral is already marked as activated
    }

    // Update status to rewarded if credit increment succeeded
    if (!creditError) {
      await supabaseAdmin
        .from("referrals")
        .update({ status: "rewarded" })
        .eq("id", referral.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in reward endpoint:", error);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}

