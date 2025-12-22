// Block 228000 — Update Insurance Supplement Status
// POST /api/supplements/update-status
// Updates supplement status (approved, denied, negotiating)

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supplement_id, status, approved_amount, notes } = await req.json();

    if (!supplement_id || !status) {
      return NextResponse.json(
        { error: "supplement_id and status are required" },
        { status: 400 }
      );
    }

    if (!['sent', 'negotiating', 'approved', 'denied'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: sent, negotiating, approved, or denied" },
        { status: 400 }
      );
    }

    // Get supplement
    const { data: supplement, error: supplementError } = await supabase
      .from("insurance_supplements")
      .select("*")
      .eq("id", supplement_id)
      .single();

    if (supplementError || !supplement) {
      return NextResponse.json(
        { error: "Supplement not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", supplement.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "approved") {
      updateData.approved_amount = approved_amount || supplement.requested_amount;
      updateData.approved_at = new Date().toISOString();
      // Trigger will update job value automatically
    } else if (status === "denied") {
      updateData.denied_at = new Date().toISOString();
    } else if (status === "negotiating") {
      // Continue negotiation - no special fields needed
    }

    // Update supplement
    const { error: updateError } = await supabase
      .from("insurance_supplements")
      .update(updateData)
      .eq("id", supplement_id);

    if (updateError) {
      console.error("Error updating supplement:", updateError);
      return NextResponse.json(
        { error: "Failed to update supplement status" },
        { status: 500 }
      );
    }

    // If approved, trigger payment schedule update
    if (status === "approved") {
      // The database trigger will update job contract value
      // Payment schedule update would be handled by separate endpoint
    }

    return NextResponse.json({
      success: true,
      supplement_id,
      status,
      approved_amount: updateData.approved_amount || null,
      message: `Supplement status updated to ${status}`,
    });
  } catch (error: any) {
    console.error("Error updating supplement status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update supplement status" },
      { status: 500 }
    );
  }
}

























