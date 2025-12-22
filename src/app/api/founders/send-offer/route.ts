import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Block 10300 — Send Founders Deal Offer
 * 
 * Marks that the founders deal offer has been sent to the user.
 * This is called when showing the founders deal message/banner.
 */
export async function POST(req: NextRequest) {
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

    // Update eligibility record to mark offer as sent
    const { error } = await supabase
      .from("founders_deal_eligibility")
      .update({
        offer_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Error updating offer sent:", error);
      return NextResponse.json(
        { error: "Failed to update offer", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Founders deal offer marked as sent",
    });
  } catch (error: any) {
    console.error("Send founders offer error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send offer" },
      { status: 500 }
    );
  }
}























































