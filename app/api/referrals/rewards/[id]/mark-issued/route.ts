import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/referrals/rewards/[id]/mark-issued
 * Mark a reward as issued
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: reward, error } = await supabase
      .from("referral_rewards")
      .update({
        status: "issued",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating reward:", error);
      return NextResponse.json(
        { error: "Failed to update reward" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reward });
  } catch (error: any) {
    console.error("Error in POST /api/referrals/rewards/[id]/mark-issued:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























