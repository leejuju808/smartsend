import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Block 10300 — Check Founders Deal Eligibility
 * 
 * Checks if a workspace is eligible for the founders deal:
 * - Workspace created > 72 hours ago
 * - Has homeowner reply OR warm lead OR job value shown
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Check eligibility using the database function
    const { data: eligibility, error } = await supabase.rpc(
      "check_founders_deal_eligibility",
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error checking eligibility:", error);
      return NextResponse.json(
        { error: "Failed to check eligibility", details: error.message },
        { status: 500 }
      );
    }

    // Get eligibility details
    const { data: eligibilityDetails } = await supabase
      .from("founders_deal_eligibility")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    // Check if already converted
    const { data: subscription } = await supabase
      .from("workspace_subscriptions")
      .select("is_founder, plan_id, status")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const isFounder = subscription?.is_founder || false;
    const alreadyConverted = !!subscription?.status && subscription.status !== "inactive";

    return NextResponse.json({
      eligible: eligibility === true,
      is_founder: isFounder,
      already_converted: alreadyConverted,
      eligibility_details: eligibilityDetails,
      subscription: subscription,
    });
  } catch (error: any) {
    console.error("Founders eligibility check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check eligibility" },
      { status: 500 }
    );
  }
}























































