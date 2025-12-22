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
 * GET /api/insights/revenue
 * Get "Money on the Table" panel data - revenue opportunities
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

    // Calculate revenue opportunities from various sources
    const [
      stalledHighValueJobs,
      unbookedAppointments,
      unsentStormSequences,
      unfinishedQuotes,
      neglectedInsuranceClaims,
    ] = await Promise.all([
      // Stalled high-value jobs (potential_job_value > $5000, no activity in 7+ days)
      supabaseAdmin
        .from("lead_auto_follow_up_stats")
        .select("contact_id, potential_job_value, pipeline_stage, updated_at")
        .eq("workspace_id", workspaceId)
        .gt("potential_job_value", 5000)
        .lt("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .not("pipeline_stage", "eq", "won")
        .not("pipeline_stage", "eq", "not_interested"),

      // Unbooked appointments (hot leads with no appointment scheduled)
      supabaseAdmin
        .from("contacts")
        .select("id, email, first_name, last_name, pipeline_stage_key")
        .eq("workspace_id", workspaceId)
        .in("pipeline_stage_key", ["hot_leads"])
        .is("next_appointment_at", null),

      // Unsent storm sequences (storm-affected leads with no sequence sent)
      supabaseAdmin
        .rpc("get_storm_leads_without_sequences", { p_workspace_id: workspaceId })
        .catch(() => ({ data: [] })),

      // Unfinished quotes (quote_sent_at but not won, older than 3 days)
      supabaseAdmin
        .from("contacts")
        .select("id, email, first_name, last_name, quote_amount, quote_sent_at")
        .eq("workspace_id", workspaceId)
        .not("quote_sent_at", "is", null)
        .not("pipeline_stage_key", "eq", "won")
        .lt("quote_sent_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()),

      // Neglected insurance claims (filed but no follow-up in 5+ days)
      supabaseAdmin
        .from("insurance_metadata")
        .select("contact_id, claim_number, claim_date, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("has_insurance_claim", true)
        .lt("updated_at", new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // Calculate total revenue at risk
    const stalledRevenue =
      stalledHighValueJobs.data?.reduce(
        (sum, job) => sum + Number(job.potential_job_value || 0),
        0
      ) || 0;

    const unbookedRevenue = (unbookedAppointments.data?.length || 0) * 5000; // Estimate $5k per appointment

    const unfinishedQuotesRevenue =
      unfinishedQuotes.data?.reduce(
        (sum, quote) => sum + Number(quote.quote_amount || 0),
        0
      ) || 0;

    const insuranceRevenue = (neglectedInsuranceClaims.data?.length || 0) * 15000; // Estimate $15k per insurance claim

    const totalRevenueAtRisk =
      stalledRevenue +
      unbookedRevenue +
      unfinishedQuotesRevenue +
      insuranceRevenue;

    return NextResponse.json({
      total_revenue_at_risk: totalRevenueAtRisk,
      breakdown: {
        stalled_high_value_jobs: {
          count: stalledHighValueJobs.data?.length || 0,
          revenue: stalledRevenue,
          items: stalledHighValueJobs.data?.slice(0, 10) || [],
        },
        unbooked_appointments: {
          count: unbookedAppointments.data?.length || 0,
          revenue: unbookedRevenue,
          items: unbookedAppointments.data?.slice(0, 10) || [],
        },
        unsent_storm_sequences: {
          count: Array.isArray(unsentStormSequences.data)
            ? unsentStormSequences.data.length
            : 0,
          revenue: Array.isArray(unsentStormSequences.data)
            ? unsentStormSequences.data.length * 8000
            : 0, // Estimate $8k per storm sequence
          items: Array.isArray(unsentStormSequences.data)
            ? unsentStormSequences.data.slice(0, 10)
            : [],
        },
        unfinished_quotes: {
          count: unfinishedQuotes.data?.length || 0,
          revenue: unfinishedQuotesRevenue,
          items: unfinishedQuotes.data?.slice(0, 10) || [],
        },
        neglected_insurance_claims: {
          count: neglectedInsuranceClaims.data?.length || 0,
          revenue: insuranceRevenue,
          items: neglectedInsuranceClaims.data?.slice(0, 10) || [],
        },
      },
    });
  } catch (error: any) {
    console.error("Revenue insights error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































