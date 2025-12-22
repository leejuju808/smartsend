// Block 20360 — SmartSend Inbox Homeowner Insurance Brain v1 API
// GET /api/inbox/insurance-brain?thread_id=xxx - Get insurance analysis for a thread
// POST /api/inbox/insurance-brain - Trigger insurance analysis for a thread or message

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/inbox/insurance-brain?thread_id=xxx
 * Returns the 7-tag insurance summary for a thread
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("thread_id");

    if (!threadId) {
      return NextResponse.json(
        { error: "thread_id is required" },
        { status: 400 }
      );
    }

    // Get insurance summary using the database function
    const { data: summary, error } = await supabase.rpc(
      "get_insurance_summary",
      {
        p_thread_id: threadId,
      }
    );

    if (error) {
      console.error("Error getting insurance summary:", error);
      return NextResponse.json(
        { error: "Failed to get insurance summary", details: error.message },
        { status: 500 }
      );
    }

    // Also get full thread data for additional context
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select(
        `
        id,
        insurance_carrier,
        insurance_claim_status,
        insurance_deductible_amount,
        insurance_deductible_type,
        insurance_deductible_percentage,
        insurance_payout_type,
        insurance_depreciation_recoverable,
        insurance_depreciation_amount,
        insurance_install_ready,
        insurance_next_action,
        insurance_analysis_metadata,
        insurance_analyzed_at,
        insurance_last_updated_at
      `
      )
      .eq("id", threadId)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Return the 7-tag output format (from spec)
    const result = {
      insurance_carrier: thread.insurance_carrier,
      claim_status: thread.insurance_claim_status,
      deductible: thread.insurance_deductible_amount,
      payout_type: thread.insurance_payout_type,
      depreciation_recoverable: thread.insurance_depreciation_recoverable,
      install_ready: thread.insurance_install_ready,
      next_action: thread.insurance_next_action,
      // Additional details
      deductible_type: thread.insurance_deductible_type,
      deductible_percentage: thread.insurance_deductible_percentage,
      depreciation_amount: thread.insurance_depreciation_amount,
      analyzed_at: thread.insurance_analyzed_at,
      metadata: thread.insurance_analysis_metadata,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Insurance Brain API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/insurance-brain
 * Triggers insurance analysis for a thread or message
 * Body: { thread_id?: string, message_id?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { thread_id, message_id } = body;

    if (!thread_id && !message_id) {
      return NextResponse.json(
        { error: "thread_id or message_id is required" },
        { status: 400 }
      );
    }

    // Call the insurance-brain-v1 Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/insurance-brain-v1`;

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        thread_id: thread_id || null,
        message_id: message_id || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to analyze insurance",
          details: errorText,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[Insurance Brain API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































