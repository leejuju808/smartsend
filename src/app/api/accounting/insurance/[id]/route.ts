import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/accounting/insurance/[id]
 * Update insurance payment received
 * Body: { acv_received, depreciation_received, deductible_collected, supplement_received, ... }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get tracking to verify access
    const { data: tracking } = await supabase
      .from("insurance_tracking")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!tracking) {
      return NextResponse.json({ error: "Tracking not found" }, { status: 404 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", tracking.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update payment received
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.acv_received !== undefined) {
      updateData.acv_received = parseFloat(body.acv_received);
      if (updateData.acv_received > 0) {
        updateData.acv_received_at = new Date().toISOString();
        updateData.status = "acv_received";
      }
    }

    if (body.depreciation_received !== undefined) {
      updateData.depreciation_received = parseFloat(body.depreciation_received);
      if (updateData.depreciation_received > 0) {
        updateData.depreciation_received_at = new Date().toISOString();
      }
    }

    if (body.deductible_collected !== undefined) {
      updateData.deductible_collected = parseFloat(body.deductible_collected);
      if (updateData.deductible_collected > 0) {
        updateData.deductible_collected_at = new Date().toISOString();
      }
    }

    if (body.supplement_received !== undefined) {
      updateData.supplement_received = parseFloat(body.supplement_received);
      if (updateData.supplement_received > 0) {
        updateData.supplement_pending = Math.max(0, (updateData.supplement_pending || 0) - updateData.supplement_received);
      }
    }

    if (body.supplement_approved !== undefined) {
      updateData.supplement_approved = parseFloat(body.supplement_approved);
      updateData.supplement_pending = updateData.supplement_approved;
      updateData.status = "supplement_pending";
    }

    if (body.mortgage_endorsement_received !== undefined) {
      updateData.mortgage_endorsement_received = body.mortgage_endorsement_received;
      if (updateData.mortgage_endorsement_received) {
        updateData.mortgage_endorsement_received_at = new Date().toISOString();
      }
    }

    const { data: updated, error } = await supabase
      .from("insurance_tracking")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating insurance tracking:", error);
      return NextResponse.json(
        { error: "Failed to update insurance tracking", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ tracking: updated });
  } catch (error: any) {
    console.error("Error updating insurance tracking:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
