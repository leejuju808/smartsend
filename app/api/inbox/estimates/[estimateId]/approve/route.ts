import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/estimates/[estimateId]/approve
 * Approve estimate and move thread to pipeline stage
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { estimateId: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { pipelineStage = "pending_decision" } = body; // Can override pipeline stage

    const { estimateId } = params;

    // Get estimate with thread
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        inbox_threads:thread_id (
          id,
          pipeline_stage
        )
      `)
      .eq("id", estimateId)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const thread = estimate.inbox_threads;

    // Update estimate status
    const { data: updatedEstimate, error: updateError } = await supabase
      .from("estimates")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimateId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating estimate:", updateError);
      return NextResponse.json(
        { error: "Failed to approve estimate" },
        { status: 500 }
      );
    }

    // Update thread pipeline stage
    const validStages = [
      "new_lead",
      "contacted",
      "estimate_scheduled",
      "estimate_completed",
      "pending_decision",
      "won",
      "lost",
    ];

    const newPipelineStage = validStages.includes(pipelineStage)
      ? pipelineStage
      : "pending_decision";

    const { error: threadUpdateError } = await supabase
      .from("inbox_threads")
      .update({
        pipeline_stage: newPipelineStage,
        updated_at: new Date().toISOString(),
        // Update estimated value if not already set
        thread_estimated_value: estimate.thread_estimated_value || estimate.estimated_total_avg,
      })
      .eq("id", thread.id);

    if (threadUpdateError) {
      console.error("Error updating thread:", threadUpdateError);
    }

    // If approved and moved to "won", update revenue metrics
    if (newPipelineStage === "won") {
      // The revenue view will automatically pick this up via the pipeline_stage
      // No additional action needed here
    }

    return NextResponse.json({
      success: true,
      estimate: updatedEstimate,
      pipeline_stage: newPipelineStage,
    });
  } catch (error) {
    console.error("Error in /api/inbox/estimates/[estimateId]/approve:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































