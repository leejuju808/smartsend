import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/insights/conversions
 * Get conversion path insights - stage-by-stage flow analysis
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get cached conversion insights
    const { data: conversionInsights } = await supabaseAdmin
      .from("insights_conversions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (conversionInsights) {
      return NextResponse.json({
        stage_flow: {
          cold_to_warm: {
            count: conversionInsights.cold_to_warm_count || 0,
            rate: Number(conversionInsights.cold_to_warm_rate || 0),
            avg_days: Number(conversionInsights.avg_days_in_cold || 0),
          },
          warm_to_hot: {
            count: conversionInsights.warm_to_hot_count || 0,
            rate: Number(conversionInsights.warm_to_hot_rate || 0),
            avg_days: Number(conversionInsights.avg_days_in_warm || 0),
          },
          hot_to_appointment: {
            count: conversionInsights.hot_to_appointment_count || 0,
            rate: Number(conversionInsights.hot_to_appointment_rate || 0),
            avg_days: Number(conversionInsights.avg_days_in_hot || 0),
          },
          appointment_to_quote: {
            count: conversionInsights.appointment_to_quote_count || 0,
            rate: Number(conversionInsights.appointment_to_quote_rate || 0),
            avg_days: Number(conversionInsights.avg_days_in_appointment || 0),
          },
          quote_to_won: {
            count: conversionInsights.quote_to_won_count || 0,
            rate: Number(conversionInsights.quote_to_won_rate || 0),
            avg_days: Number(conversionInsights.avg_days_in_quote || 0),
          },
        },
        overall_conversion_rate: Number(conversionInsights.overall_conversion_rate || 0),
        drop_offs: {
          at_warm: Number(conversionInsights.drop_off_at_warm || 0),
          at_hot: Number(conversionInsights.drop_off_at_hot || 0),
          at_appointment: Number(conversionInsights.drop_off_at_appointment || 0),
          at_quote: Number(conversionInsights.drop_off_at_quote || 0),
        },
        bottlenecks: {
          biggest: conversionInsights.biggest_bottleneck || null,
          reason: conversionInsights.bottleneck_reason || null,
        },
        suggested_improvements: conversionInsights.suggested_improvements || [],
        calculated_at: conversionInsights.calculated_at,
      });
    }

    // If no cached data, return empty structure
    return NextResponse.json({
      stage_flow: {
        cold_to_warm: { count: 0, rate: 0, avg_days: 0 },
        warm_to_hot: { count: 0, rate: 0, avg_days: 0 },
        hot_to_appointment: { count: 0, rate: 0, avg_days: 0 },
        appointment_to_quote: { count: 0, rate: 0, avg_days: 0 },
        quote_to_won: { count: 0, rate: 0, avg_days: 0 },
      },
      overall_conversion_rate: 0,
      drop_offs: {
        at_warm: 0,
        at_hot: 0,
        at_appointment: 0,
        at_quote: 0,
      },
      bottlenecks: {
        biggest: null,
        reason: null,
      },
      suggested_improvements: [],
      calculated_at: null,
    });
  } catch (error: any) {
    console.error("Conversion insights error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































