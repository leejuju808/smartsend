import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWorkspaceId } from "@/lib/auth-helpers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/usage/record
 * Record usage for metered billing (emails_sent, ai_credits)
 * Uses credits first, then charges via Stripe usage records
 */
export async function POST(req: NextRequest) {
  try {
    const { metric_name, quantity = 1, workspace_id } = await req.json();

    if (!metric_name || !workspace_id) {
      return NextResponse.json(
        { error: "metric_name and workspace_id required" },
        { status: 400 }
      );
    }

    if (!["emails_sent", "ai_credits"].includes(metric_name)) {
      return NextResponse.json(
        { error: "metric_name must be 'emails_sent' or 'ai_credits'" },
        { status: 400 }
      );
    }

    // Record usage with credit deduction
    const { data: result, error } = await supabase.rpc(
      "record_usage_with_credits",
      {
        p_workspace_id: workspace_id,
        p_metric_name: metric_name,
        p_quantity: quantity,
      }
    );

    if (error) {
      console.error("Error recording usage:", error);
      return NextResponse.json(
        { error: "Failed to record usage", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Usage recording error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

