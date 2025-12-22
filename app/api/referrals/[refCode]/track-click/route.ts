import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackReferralClick } from "@/lib/reviews-referrals/automation";

/**
 * POST /api/referrals/[refCode]/track-click
 * Track a click on a referral link
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refCode: string }> }
) {
  try {
    const { refCode } = await params;
    await trackReferralClick(refCode);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error tracking referral click:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























