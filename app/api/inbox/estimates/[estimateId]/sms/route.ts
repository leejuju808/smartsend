import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/estimates/[estimateId]/sms
 * Get SMS-friendly estimate text
 */
export async function GET(
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

    const { estimateId } = params;

    // Get estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select("id, sms_estimate_text, estimated_total_min, estimated_total_max, roof_squares_min, roof_squares_max, job_type")
      .eq("id", estimateId)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    // Return SMS estimate text if available, otherwise generate it
    const smsText = estimate.sms_estimate_text || 
      `Your roof appears to be ${estimate.roof_squares_min || 18}-${estimate.roof_squares_max || 22} squares. Estimated ${estimate.job_type === 'roof_replacement' ? 'full replacement' : estimate.job_type?.replace('_', ' ')} is $${((estimate.estimated_total_min || 0) / 1000).toFixed(1)}k-$${((estimate.estimated_total_max || 0) / 1000).toFixed(1)}k. We can inspect tomorrow at 10 AM.`;

    return NextResponse.json({
      success: true,
      sms_text: smsText,
      estimate_id: estimate.id,
    });
  } catch (error) {
    console.error("Error in GET /api/inbox/estimates/[estimateId]/sms:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































