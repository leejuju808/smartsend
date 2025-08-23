import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(request: NextRequest) {
  try {
    const { referralCode, email } = await request.json();

    if (!referralCode || !email) {
      return NextResponse.json(
        { error: "Missing referral code or email" },
        { status: 400 }
      );
    }

    // Find the referrer by referral code
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (referrerError || !referrer) {
      return NextResponse.json(
        { error: "Invalid referral code" },
        { status: 400 }
      );
    }

    // Find the referee by email (they should have just signed up)
    const { data: referee, error: refereeError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (refereeError || !referee) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if referral already exists
    const { data: existingReferral } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("inviter", referrer.id)
      .eq("invitee", referee.id)
      .maybeSingle();

    if (existingReferral) {
      return NextResponse.json(
        { error: "Referral already exists" },
        { status: 409 }
      );
    }

    // Create the referral
    const { error: insertError } = await supabaseAdmin
      .from("referrals")
      .insert({
        inviter: referrer.id,
        invitee: referee.id,
        email: email,
        status: "joined"
      });

    if (insertError) {
      console.error("Error creating referral:", insertError);
      return NextResponse.json(
        { error: "Failed to create referral" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: "Referral created successfully"
    });

  } catch (error) {
    console.error("Error creating referral:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

