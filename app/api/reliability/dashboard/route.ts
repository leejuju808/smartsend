// Block 23280 — SmartSend Quality & Reliability Monitoring v1
// API Route: GET /api/reliability/dashboard
// Returns reliability dashboard data for internal monitoring

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/reliability/dashboard
 * Returns comprehensive reliability monitoring dashboard data
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

    // Use admin client for reliability dashboard (internal only)
    const adminSupabase = supabaseAdmin;

    // Fetch all dashboard data in parallel
    const [
      todayErrors,
      errorsBySource,
      criticalUnresolved,
      metricsSummary,
      betaIssuesSummary,
      automationHealth,
      aiHealth,
      paymentsHealth,
      fieldAppHealth,
      documentsHealth,
      systemLatency,
    ] = await Promise.all([
      // Today's Error Count
      adminSupabase
        .from("view_today_errors")
        .select("*")
        .single(),

      // Errors by Source (Last 24h)
      adminSupabase
        .from("view_errors_by_source")
        .select("*")
        .order("error_count", { ascending: false }),

      // Critical Unresolved Errors
      adminSupabase
        .from("view_critical_unresolved")
        .select("*")
        .limit(20),

      // Performance Metrics Summary
      adminSupabase
        .from("view_metrics_summary")
        .select("*"),

      // Beta Issues Summary
      adminSupabase
        .from("view_beta_issues_summary")
        .select("*"),

      // Automation Health (custom query)
      adminSupabase
        .rpc("get_automation_health"),

      // AI Health (custom query)
      adminSupabase
        .rpc("get_ai_health"),

      // Payments Health (custom query)
      adminSupabase
        .rpc("get_payments_health"),

      // Field App Health (custom query)
      adminSupabase
        .rpc("get_field_app_health"),

      // Documents Health (custom query)
      adminSupabase
        .rpc("get_documents_health"),

      // System Latency (from metrics)
      adminSupabase
        .from("system_metrics")
        .select("label, value, created_at")
        .in("label", [
          "edge_function_duration_ms",
          "api_latency_ms",
          "database_query_ms",
        ])
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),
    ]);

    // Calculate system latency percentiles
    const latencyData = systemLatency.data || [];
    const latencyByLabel = latencyData.reduce((acc: any, item: any) => {
      if (!acc[item.label]) {
        acc[item.label] = [];
      }
      acc[item.label].push(item.value);
      return acc;
    }, {});

    const latencyStats: Record<string, any> = {};
    for (const [label, values] of Object.entries(latencyByLabel)) {
      const sorted = (values as number[]).sort((a, b) => a - b);
      const len = sorted.length;
      latencyStats[label] = {
        median: sorted[Math.floor(len / 2)],
        p95: sorted[Math.floor(len * 0.95)],
        p99: sorted[Math.floor(len * 0.99)],
        count: len,
      };
    }

    return NextResponse.json({
      ok: true,
      data: {
        // Today's Error Count
        todayErrors: todayErrors.data || {
          critical_count: 0,
          error_count: 0,
          warning_count: 0,
          info_count: 0,
          total_count: 0,
          sources_affected: 0,
        },

        // Errors by Source
        errorsBySource: errorsBySource.data || [],

        // Critical Unresolved Errors
        criticalUnresolved: criticalUnresolved.data || [],

        // Performance Metrics Summary
        metricsSummary: metricsSummary.data || [],

        // Beta Issues Summary
        betaIssuesSummary: betaIssuesSummary.data || [],

        // Automation Health
        automationHealth: automationHealth.data || {
          jobs_processed: 0,
          failures: 0,
          avg_execution_time_ms: 0,
        },

        // AI Health
        aiHealth: aiHealth.data || {
          insights_generated: 0,
          failures: 0,
          avg_time_ms: 0,
        },

        // Payments Health
        paymentsHealth: paymentsHealth.data || {
          payments_succeeded: 0,
          payments_failed: 0,
          stripe_webhook_failures: 0,
        },

        // Field App Health
        fieldAppHealth: fieldAppHealth.data || {
          photo_upload_success_rate: 0,
          check_in_failures: 0,
        },

        // Documents Health
        documentsHealth: documentsHealth.data || {
          signed: 0,
          viewed: 0,
          failed_sign_attempts: 0,
        },

        // System Latency
        systemLatency: latencyStats,
      },
      calculatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Reliability dashboard error:", error);
    
    // Log the error itself
    await supabaseAdmin.from("system_errors").insert({
      source: "reliability-dashboard",
      severity: "error",
      message: `Dashboard API error: ${error.message}`,
      details: { stack: error.stack },
    }).catch(() => {});

    return NextResponse.json(
      {
        error: "Failed to load reliability dashboard",
        details: error.message,
      },
      { status: 500 }
    );
  }
}







































