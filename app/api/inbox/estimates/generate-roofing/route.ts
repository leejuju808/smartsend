import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/estimates/generate-roofing
 * Generate a roofing estimate using Block 20490 (Roofing AI Estimator v1)
 * 
 * This endpoint generates instant roofing estimates from parsed roof scope,
 * market rates, and insurance data.
 * 
 * Trigger conditions:
 * - Block 20380 successfully parsed a roof_scope
 * - AND either:
 *   - Homeowner asks for a quote
 *   - Claim status = "Approved" but no contractor estimate submitted
 *   - Contractor clicks "Generate Estimate" button
 */
export async function POST(req: NextRequest) {
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
    const { threadId, triggerReason } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    // Get thread with parsed scope data
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        workspace_id,
        contact_id,
        roof_scope,
        claim_financials,
        profitability_signals,
        has_parsed_scope,
        contacts:contact_id (
          zip_code,
          city,
          state,
          first_name,
          last_name
        )
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Check if roof scope is parsed
    if (!thread.has_parsed_scope || !thread.roof_scope || Object.keys(thread.roof_scope).length === 0) {
      return NextResponse.json(
        { 
          error: "No parsed roof scope found. Please ensure Block 20380 has parsed the scope first.",
          requires_parsing: true
        },
        { status: 400 }
      );
    }

    // Call the edge function to generate estimate
    const { data: functionData, error: functionError } = await supabase.functions.invoke(
      "roofing-ai-estimator-v1",
      {
        body: {
          thread_id: threadId,
          workspace_id: thread.workspace_id,
          trigger_reason: triggerReason || "manual_generate",
        },
      }
    );

    if (functionError) {
      console.error("Edge function error:", functionError);
      return NextResponse.json(
        { error: "Failed to generate estimate", details: functionError.message },
        { status: 500 }
      );
    }

    if (!functionData?.success) {
      return NextResponse.json(
        { error: functionData?.error || "Failed to generate estimate" },
        { status: 500 }
      );
    }

    // Return the generated estimate
    return NextResponse.json({
      success: true,
      estimate: functionData.estimate,
    });
  } catch (error: any) {
    console.error("Error generating roofing estimate:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
















































