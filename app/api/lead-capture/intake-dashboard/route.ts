// Block 19900 — Intake Performance Dashboard
// GET /api/lead-capture/intake-dashboard
// Returns intake performance metrics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dateFilter = startDate && endDate
      ? `AND created_at >= '${startDate}' AND created_at <= '${endDate}'`
      : "";

    // Leads by source
    const { data: leadsBySource } = await supabase
      .from("contacts")
      .select("lead_source, created_at")
      .eq("workspace_id", workspaceId)
      .not("lead_source", "is", null);

    const leadsBySourceCounts = (leadsBySource || []).reduce((acc: any, lead: any) => {
      acc[lead.lead_source] = (acc[lead.lead_source] || 0) + 1;
      return acc;
    }, {});

    // Form submission stats
    const { data: formSubmissions } = await supabase
      .from("lead_form_submissions")
      .select("*, lead_capture_forms(form_slug)")
      .eq("workspace_id", workspaceId);

    // Missed call recovery stats
    const { data: missedCalls } = await supabase
      .from("missed_calls")
      .select("*")
      .eq("workspace_id", workspaceId);

    const missedCallStats = {
      total: missedCalls?.length || 0,
      threads_created: missedCalls?.filter((c) => c.thread_id).length || 0,
      sms_sent: missedCalls?.filter((c) => c.auto_sms_sent).length || 0,
      recovery_rate:
        missedCalls && missedCalls.length > 0
          ? (missedCalls.filter((c) => c.thread_id).length / missedCalls.length) * 100
          : 0,
    };

    // Facebook Lead Ads stats
    const { data: fbLeads } = await supabase
      .from("facebook_lead_ads")
      .select("*")
      .eq("workspace_id", workspaceId);

    const fbLeadStats = {
      total: fbLeads?.length || 0,
      threads_created: fbLeads?.filter((l) => l.thread_id).length || 0,
      processed: fbLeads?.filter((l) => l.processed).length || 0,
      avg_processing_time_seconds: calculateAvgProcessingTime(fbLeads || []),
    };

    // Response time by source
    const { data: responseTimeData } = await supabase.rpc(
      "get_response_time_by_source",
      { p_workspace_id: workspaceId }
    );

    // Conversion rate by source (leads that have threads)
    const { data: contactsWithThreads } = await supabase
      .from("contacts")
      .select("lead_source, inbox_threads(id)")
      .eq("workspace_id", workspaceId)
      .not("lead_source", "is", null);

    const conversionRates: Record<string, { total: number; converted: number; rate: number }> = {};
    (contactsWithThreads || []).forEach((contact: any) => {
      if (!contact.lead_source) return;
      if (!conversionRates[contact.lead_source]) {
        conversionRates[contact.lead_source] = { total: 0, converted: 0, rate: 0 };
      }
      conversionRates[contact.lead_source].total++;
      if (contact.inbox_threads && contact.inbox_threads.length > 0) {
        conversionRates[contact.lead_source].converted++;
      }
    });

    Object.keys(conversionRates).forEach((source) => {
      const stats = conversionRates[source];
      stats.rate = stats.total > 0 ? (stats.converted / stats.total) * 100 : 0;
    });

    // Average job value by source (from smart_intake_analysis)
    const { data: jobValueData } = await supabase
      .from("smart_intake_analysis")
      .select("expected_job_value, contacts(lead_source)")
      .eq("workspace_id", workspaceId)
      .not("expected_job_value", "is", null);

    const avgJobValueBySource: Record<string, number> = {};
    (jobValueData || []).forEach((analysis: any) => {
      const source = analysis.contacts?.lead_source;
      if (!source) return;
      if (!avgJobValueBySource[source]) {
        avgJobValueBySource[source] = { sum: 0, count: 0 };
      }
      avgJobValueBySource[source].sum += parseFloat(analysis.expected_job_value || 0);
      avgJobValueBySource[source].count++;
    });

    Object.keys(avgJobValueBySource).forEach((source) => {
      const stats = avgJobValueBySource[source];
      avgJobValueBySource[source] = stats.count > 0 ? stats.sum / stats.count : 0;
    });

    return NextResponse.json({
      leads_by_source: leadsBySourceCounts,
      form_submissions: {
        total: formSubmissions?.length || 0,
        by_form: groupBy(formSubmissions || [], (s: any) => s.lead_capture_forms?.form_slug || "unknown"),
      },
      missed_call_recovery: missedCallStats,
      facebook_lead_stats: fbLeadStats,
      response_time_by_source: responseTimeData || [],
      conversion_rate_by_source: conversionRates,
      avg_job_value_by_source: avgJobValueBySource,
    });
  } catch (error: any) {
    console.error("Error fetching intake dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper: Calculate average processing time
function calculateAvgProcessingTime(leads: any[]): number {
  const processed = leads.filter((l) => l.processed && l.processed_at);
  if (processed.length === 0) return 0;

  const times = processed.map((l) => {
    const created = new Date(l.created_at).getTime();
    const processed = new Date(l.processed_at).getTime();
    return (processed - created) / 1000; // seconds
  });

  return times.reduce((a, b) => a + b, 0) / times.length;
}

// Helper: Group array by key
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}



















































