// Block 21080 — Scope Comparison Engine v2 API
// Returns detailed three-way comparison (Insurance vs SmartSend vs Market)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: threadId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get thread to verify access
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, scope_comparison_id, insurance_carrier, workspace_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get scope comparison
    let comparison = null;
    if (thread.scope_comparison_id) {
      const { data: comparisonData, error: comparisonError } = await supabase
        .from("scope_comparisons")
        .select("*")
        .eq("id", thread.scope_comparison_id)
        .single();

      if (!comparisonError && comparisonData) {
        comparison = comparisonData;
      }
    }

    // If no comparison exists, try to find one by thread_id
    if (!comparison) {
      const { data: comparisonData } = await supabase
        .from("scope_comparisons")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      comparison = comparisonData;
    }

    // If still no comparison, return empty result
    if (!comparison) {
      return NextResponse.json({
        comparison: null,
        has_comparison: false,
        message: "No scope comparison available for this thread",
      });
    }

    // Get carrier bias patterns if carrier is known
    let carrierBiasPatterns = null;
    if (thread.insurance_carrier) {
      const { data: biasPatterns } = await supabase
        .from("carrier_bias_patterns")
        .select("*")
        .eq("carrier_name", thread.insurance_carrier)
        .eq("is_active", true)
        .order("omission_rate", { ascending: false })
        .limit(10);

      if (biasPatterns && biasPatterns.length > 0) {
        carrierBiasPatterns = biasPatterns.map((pattern) => ({
          line_item: pattern.normalized_category,
          omission_rate: pattern.omission_rate,
          underpricing_rate: pattern.underpricing_rate,
          avg_underpayment_when_missing: pattern.avg_underpayment_when_missing,
          avg_underpayment_when_underpriced: pattern.avg_underpayment_when_underpriced,
          total_claims_analyzed: pattern.total_claims_analyzed,
          description: `${pattern.normalized_category} ${
            pattern.omission_rate > 0.5 ? "omitted" : "underpriced"
          } in ${Math.round(pattern.omission_rate * 100)}% of claims`,
        }));
      }
    }

    // Format response
    const response = {
      comparison_id: comparison.id,
      thread_id: threadId,
      has_comparison: true,
      
      // Three-way totals
      insurance_rcv: comparison.insurance_rcv || 0,
      smartsend_estimate: comparison.smartsend_estimate_total || 0,
      market_value: comparison.market_price_total || 0,
      
      // Differences
      difference_insurance_vs_smartsend: comparison.difference_insurance_vs_smartsend || 0,
      difference_insurance_vs_market: comparison.difference_insurance_vs_market || 0,
      difference_smartsend_vs_market: comparison.difference_smartsend_vs_market || 0,
      
      // Underpayment breakdown
      underpayment_amount: comparison.underpayment_amount || 0,
      missing_items_total: comparison.missing_items_total || 0,
      underpriced_items_total: comparison.underpriced_items_total || 0,
      quantity_errors_total: comparison.quantity_errors_total || 0,
      o_and_p_missing_total: comparison.o_and_p_missing_total || 0,
      total_supplement_opportunity: comparison.total_supplement_opportunity || 0,
      
      // Line item comparisons
      line_item_comparisons: comparison.line_item_comparisons || [],
      
      // Human-friendly summary
      human_friendly_summary: comparison.human_friendly_summary || {},
      
      // Carrier bias
      carrier_bias_detected: comparison.carrier_bias_detected || {},
      carrier_bias_patterns: carrierBiasPatterns,
      
      // O&P Analysis
      o_and_p: {
        included: comparison.o_and_p_included || false,
        should_be_included: comparison.o_and_p_should_be_included || false,
        missing_value: comparison.o_and_p_missing_value || 0,
        justification: comparison.o_and_p_justification || null,
      },
      
      // Missing items
      missing_line_items: comparison.missing_line_items || [],
      underpriced_line_items: comparison.underpriced_line_items || [],
      quantity_mismatches: comparison.quantity_mismatches || [],
      code_items_missing: comparison.code_items_missing || [],
      
      // Supplement info
      supplement_types: comparison.supplement_types || [],
      supplement_breakdown: comparison.supplement_breakdown || {},
      
      // Metadata
      status: comparison.status,
      comparison_confidence: comparison.comparison_confidence,
      created_at: comparison.created_at,
      updated_at: comparison.updated_at,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Scope comparison API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger comparison
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: threadId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get thread data
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, insurance_carrier, workspace_id, contact_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get latest insurance attachment
    const { data: insuranceAttachment } = await supabase
      .from("insurance_attachments")
      .select("id")
      .eq("thread_id", threadId)
      .eq("processing_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!insuranceAttachment) {
      return NextResponse.json(
        { error: "No insurance attachment found for this thread" },
        { status: 404 }
      );
    }

    // Get contact zip code if available
    let zipCode: string | null = null;
    if (thread.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("zip_code")
        .eq("id", thread.contact_id)
        .single();
      zipCode = contact?.zip_code || null;
    }

    // Get roof estimate if available
    const { data: roofEstimate } = await supabase
      .from("roof_estimates")
      .select("id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Call v2 comparison function
    const { data: comparisonId, error: comparisonError } = await supabase.rpc(
      "compare_insurance_vs_smartsend_vs_market_v2",
      {
        p_thread_id: threadId,
        p_insurance_attachment_id: insuranceAttachment.id,
        p_roof_estimate_id: roofEstimate?.id || null,
        p_carrier_name: thread.insurance_carrier || null,
        p_zip_code: zipCode,
        p_workspace_id: thread.workspace_id || null,
      }
    );

    if (comparisonError) {
      console.error("Comparison error:", comparisonError);
      return NextResponse.json(
        { error: comparisonError.message || "Failed to generate comparison" },
        { status: 500 }
      );
    }

    // Fetch the created comparison
    const { data: comparison } = await supabase
      .from("scope_comparisons")
      .select("*")
      .eq("id", comparisonId)
      .single();

    return NextResponse.json({
      success: true,
      comparison_id: comparisonId,
      comparison: comparison,
    });
  } catch (error: any) {
    console.error("Scope comparison POST error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































