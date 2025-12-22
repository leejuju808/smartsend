// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Update/Delete cost item
// PATCH /api/jobs/[jobId]/costs/[itemId] - Update cost item
// DELETE /api/jobs/[jobId]/costs/[itemId] - Delete cost item

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// PATCH update cost item
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; itemId: string }> }
) {
  try {
    const { jobId, itemId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // Verify cost item exists and belongs to job/team
    const { data: existingItem, error: checkError } = await supabase
      .from("job_cost_items")
      .select("id, job_id, team_id")
      .eq("id", itemId)
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .single();

    if (checkError || !existingItem) {
      return NextResponse.json(
        { error: "Cost item not found" },
        { status: 404 }
      );
    }

    // Update cost item
    const updateData: any = {};
    if (body.category !== undefined) updateData.category = body.category;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.vendor !== undefined) updateData.vendor = body.vendor;
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.cost_date !== undefined) updateData.cost_date = body.cost_date;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.receipt_url !== undefined) updateData.receipt_url = body.receipt_url;
    if (body.receipt_file_name !== undefined) updateData.receipt_file_name = body.receipt_file_name;
    if (body.material_type !== undefined) updateData.material_type = body.material_type;
    if (body.quantity !== undefined) updateData.quantity = body.quantity ? parseFloat(body.quantity) : null;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.unit_cost !== undefined) updateData.unit_cost = body.unit_cost ? parseFloat(body.unit_cost) : null;
    if (body.crew_name !== undefined) updateData.crew_name = body.crew_name;
    if (body.hours !== undefined) updateData.hours = body.hours ? parseFloat(body.hours) : null;
    if (body.hourly_rate !== undefined) updateData.hourly_rate = body.hourly_rate ? parseFloat(body.hourly_rate) : null;

    const { data: updatedItem, error: updateError } = await supabase
      .from("job_cost_items")
      .update(updateData)
      .eq("id", itemId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating cost item:", updateError);
      return NextResponse.json(
        { error: "Failed to update cost item", details: updateError.message },
        { status: 500 }
      );
    }

    // Recalculate profit
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ costItem: updatedItem });
  } catch (error: any) {
    console.error("Error in patch costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE cost item
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; itemId: string }> }
) {
  try {
    const { jobId, itemId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify cost item exists and belongs to job/team
    const { data: existingItem, error: checkError } = await supabase
      .from("job_cost_items")
      .select("id, job_id, team_id, receipt_url")
      .eq("id", itemId)
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .single();

    if (checkError || !existingItem) {
      return NextResponse.json(
        { error: "Cost item not found" },
        { status: 404 }
      );
    }

    // Delete receipt from storage if exists
    if (existingItem.receipt_url) {
      try {
        const pathParts = existingItem.receipt_url.split("/");
        const fileName = pathParts[pathParts.length - 1];
        await supabase.storage
          .from("job-cost-receipts")
          .remove([`${jobId}/${fileName}`]);
      } catch (storageError) {
        console.error("Error deleting receipt from storage:", storageError);
        // Continue with deletion even if storage delete fails
      }
    }

    // Delete cost item
    const { error: deleteError } = await supabase
      .from("job_cost_items")
      .delete()
      .eq("id", itemId);

    if (deleteError) {
      console.error("Error deleting cost item:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete cost item", details: deleteError.message },
        { status: 500 }
      );
    }

    // Recalculate profit
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in delete costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































