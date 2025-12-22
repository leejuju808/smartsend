import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/revenue/dashboard
 * Block 16400: Returns revenue dashboard v2 data for the workspace
 * Block 99000: Enhanced with revenue tracking from jobs table
 * Includes: Pipeline values, job type breakdown, close probabilities, forecasts, storm revenue
 * PLUS: Total revenue this month/last month, pipeline value, revenue per campaign, ROI
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace - try multiple methods
  let workspaceId: string | null = null;
  
  // Method 1: Try profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  
  workspaceId = profile?.workspace_id || null;
  
  // Method 2: Try workspace_members if profile didn't work
  if (!workspaceId) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    workspaceId = member?.workspace_id || null;
  }
  
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  try {
    // =========================================================
    // BLOCK 99000: Get revenue metrics from jobs table
    // =========================================================
    
    // Get date range from query params
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");
    
    // Calculate date ranges
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    // Get revenue metrics using the helper function
    const { data: revenueMetrics, error: revenueMetricsError } = await supabase.rpc(
      'get_revenue_metrics',
      {
        p_workspace_id: workspaceId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      }
    );
    
    // Get revenue by campaign
    const { data: campaignRevenue, error: campaignRevenueError } = await supabase.rpc(
      'get_revenue_by_campaign',
      {
        p_workspace_id: workspaceId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      }
    );
    
    // Get total revenue this month (from jobs table)
    const { data: jobsThisMonth, error: jobsThisMonthError } = await supabase
      .from("jobs")
      .select("final_value")
      .eq("workspace_id", workspaceId)
      .eq("status", "won")
      .gte("created_at", thisMonthStart.toISOString())
      .lt("created_at", new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString());
    
    const totalRevenueThisMonth = jobsThisMonth?.reduce((sum, job) => sum + (Number(job.final_value) || 0), 0) || 0;
    
    // Get total revenue last month
    const { data: jobsLastMonth, error: jobsLastMonthError } = await supabase
      .from("jobs")
      .select("final_value")
      .eq("workspace_id", workspaceId)
      .eq("status", "won")
      .gte("created_at", lastMonthStart.toISOString())
      .lte("created_at", lastMonthEnd.toISOString());
    
    const totalRevenueLastMonth = jobsLastMonth?.reduce((sum, job) => sum + (Number(job.final_value) || 0), 0) || 0;
    
    // Get pipeline value (from leads with estimate_booked or estimate_completed)
    const { data: pipelineLeads, error: pipelineLeadsError } = await supabase
      .from("leads")
      .select("estimated_job_value")
      .eq("workspace_id", workspaceId)
      .in("job_stage", ["estimate_booked", "estimate_completed"])
      .neq("status", "won")
      .neq("status", "lost");
    
    const pipelineValue = pipelineLeads?.reduce((sum, lead) => sum + (Number(lead.estimated_job_value) || 0), 0) || 0;
    const pipelineCount = pipelineLeads?.length || 0;
    
    // Get revenue by lead source (from leads -> jobs)
    // First get all jobs with their lead_ids
    const { data: jobsWithLeads, error: leadSourceRevenueError } = await supabase
      .from("jobs")
      .select("final_value, lead_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "won")
      .gte("created_at", thisMonthStart.toISOString())
      .not("lead_id", "is", null);
    
    // Then get the leads to find their sources
    const leadIds = jobsWithLeads?.map((j: any) => j.lead_id).filter(Boolean) || [];
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, source, custom")
      .eq("workspace_id", workspaceId)
      .in("id", leadIds);
    
    // Create a map of lead_id -> source
    const leadSourceMap = new Map();
    leadsData?.forEach((lead: any) => {
      const source = lead.source || lead.custom?.source || "unknown";
      leadSourceMap.set(lead.id, source);
    });
    
    // Group by lead source
    const revenueBySource: Record<string, number> = {};
    jobsWithLeads?.forEach((job: any) => {
      const source = leadSourceMap.get(job.lead_id) || "unknown";
      revenueBySource[source] = (revenueBySource[source] || 0) + (Number(job.final_value) || 0);
    });
    
    // Calculate ROI (SmartSend cost vs revenue generated)
    // Default SmartSend cost is $199/mo, but could be fetched from workspace/subscription
    const smartSendMonthlyCost = 199; // TODO: Fetch from workspace subscription
    const roi = smartSendMonthlyCost > 0 
      ? ((totalRevenueThisMonth / smartSendMonthlyCost) * 100) 
      : 0;
    const roiMultiplier = smartSendMonthlyCost > 0 
      ? (totalRevenueThisMonth / smartSendMonthlyCost) 
      : 0;
    
    // First, calculate/update workspace revenue stats (existing logic)
    const { error: statsError } = await supabase.rpc('calculate_workspace_revenue_stats', {
      p_workspace_id: workspaceId
    });

    if (statsError) {
      console.warn("Error calculating workspace stats:", statsError);
    }

    // Get revenue stats from table
    const { data: revenueStats, error: statsFetchError } = await supabase
      .from("revenue_stats")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    // Get contacts with revenue data for detailed breakdown
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select(`
        id,
        email,
        first_name,
        last_name,
        lead_score,
        lead_status,
        job_type,
        revenue_category,
        estimated_value_min,
        estimated_value_max,
        close_probability,
        quote_amount,
        quote_sent_at,
        insurance_claim_value_min,
        insurance_claim_value_max,
        storm_impact_severity
      `)
      .eq("workspace_id", workspaceId)
      .not("estimated_value_min", "is", null);

    if (contactsError) {
      throw contactsError;
    }

    // Calculate detailed breakdowns
    const jobTypeBreakdown: Record<string, { count: number; value: number }> = {
      repair: { count: 0, value: 0 },
      replacement: { count: 0, value: 0 },
      insurance: { count: 0, value: 0 },
      storm: { count: 0, value: 0 },
      commercial: { count: 0, value: 0 },
      gutter: { count: 0, value: 0 },
      skylight: { count: 0, value: 0 },
      misc: { count: 0, value: 0 }
    };

    const stageBreakdown: Record<string, { count: number; value: number }> = {
      new: { count: 0, value: 0 },
      attempting: { count: 0, value: 0 },
      warm: { count: 0, value: 0 },
      hot: { count: 0, value: 0 },
      qualified: { count: 0, value: 0 },
      booked: { count: 0, value: 0 }
    };

    let totalPipeline = 0;
    let insuranceOpportunityTotal = 0;
    let insuranceOpportunityCount = 0;
    let stormJobRevenue = 0;
    let stormJobCount = 0;
    let totalQuotesSent = 0;
    let totalJobsWon = 0;
    let totalCloseProbability = 0;
    let contactsWithCloseProb = 0;

    // Top neighborhoods by revenue
    const neighborhoodRevenue: Record<string, number> = {};

    contacts?.forEach((contact) => {
      const avgValue = contact.estimated_value_min && contact.estimated_value_max
        ? (contact.estimated_value_min + contact.estimated_value_max) / 2
        : contact.estimated_value_min || 0;

      totalPipeline += avgValue;

      // Job type breakdown
      const category = contact.revenue_category || contact.job_type || 'misc';
      if (category in jobTypeBreakdown) {
        jobTypeBreakdown[category].count++;
        jobTypeBreakdown[category].value += avgValue;
      }

      // Stage breakdown
      const status = contact.lead_status || 'new';
      if (status in stageBreakdown) {
        stageBreakdown[status].count++;
        stageBreakdown[status].value += avgValue;
      }

      // Insurance opportunities
      if (category === 'insurance' || contact.job_type === 'insurance_claim') {
        insuranceOpportunityTotal += avgValue;
        insuranceOpportunityCount++;
      }

      // Storm jobs
      if (category === 'storm' || contact.job_type === 'storm_damage') {
        stormJobRevenue += avgValue;
        stormJobCount++;
      }

      // Quotes and won jobs
      if (contact.quote_sent_at) {
        totalQuotesSent++;
      }
      if (contact.lead_status === 'won') {
        totalJobsWon++;
      }

      // Close probability
      if (contact.close_probability !== null) {
        totalCloseProbability += contact.close_probability;
        contactsWithCloseProb++;
      }
    });

    // Calculate averages
    const avgCloseProbability = contactsWithCloseProb > 0
      ? totalCloseProbability / contactsWithCloseProb
      : null;

    const quoteConversionRate = totalQuotesSent > 0
      ? (totalJobsWon / totalQuotesSent) * 100
      : null;

    // Get storm revenue data
    const { data: stormRevenue } = await supabase
      .from("storm_revenue_scores")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single();

    // Get top neighborhoods (simplified - would need enrichment data)
    const topNeighborhoods = Object.entries(neighborhoodRevenue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    // Use revenue_stats if available, otherwise calculate from contacts
    const dashboardData = {
      // =========================================================
      // BLOCK 99000: Revenue Dashboard Metrics
      // =========================================================
      block99000: {
        // Total Revenue Generated
        totalRevenueThisMonth: Math.round(totalRevenueThisMonth),
        totalRevenueLastMonth: Math.round(totalRevenueLastMonth),
        
        // Pipeline Value (Future Money)
        pipelineValue: Math.round(pipelineValue),
        pipelineCount: pipelineCount,
        
        // Revenue by Campaign
        revenueByCampaign: (campaignRevenue || []).map((campaign: any) => ({
          campaignId: campaign.campaign_id,
          campaignName: campaign.campaign_name,
          leadsCount: Number(campaign.leads_count) || 0,
          jobsWonCount: Number(campaign.jobs_won_count) || 0,
          revenueWon: Math.round(Number(campaign.revenue_won) || 0),
          avgJobValue: Math.round(Number(campaign.avg_job_value) || 0),
        })),
        
        // Revenue by Lead Source
        revenueBySource: Object.entries(revenueBySource).map(([source, revenue]) => ({
          source,
          revenue: Math.round(revenue),
        })).sort((a, b) => b.revenue - a.revenue),
        
        // ROI (The Retention Killer)
        smartSendMonthlyCost: smartSendMonthlyCost,
        roi: Math.round(roi * 100) / 100, // ROI as percentage
        roiMultiplier: Math.round(roiMultiplier * 100) / 100, // How many dollars back per dollar spent
        roiMessage: `For every $1 you paid us, you made $${Math.round(roiMultiplier * 100) / 100} back.`,
      },
      
      // Pipeline totals (existing)
      totalPipelineValue: revenueStats?.total_pipeline_value || Math.round(totalPipeline),
      hotPipelineValue: revenueStats?.hot_pipeline_value || Math.round(stageBreakdown.hot.value),
      warmPipelineValue: revenueStats?.warm_pipeline_value || Math.round(stageBreakdown.warm.value),
      coldPipelineValue: revenueStats?.cold_pipeline_value || 0,

      // Value by job type
      valueByJobType: {
        repair: Math.round(jobTypeBreakdown.repair.value),
        replacement: Math.round(jobTypeBreakdown.replacement.value),
        insurance: Math.round(jobTypeBreakdown.insurance.value),
        storm: Math.round(jobTypeBreakdown.storm.value),
        commercial: Math.round(jobTypeBreakdown.commercial.value),
        gutter: Math.round(jobTypeBreakdown.gutter.value),
        skylight: Math.round(jobTypeBreakdown.skylight.value),
        misc: Math.round(jobTypeBreakdown.misc.value)
      },

      // Value by stage
      valueByStage: {
        new: Math.round(stageBreakdown.new.value),
        attempting: Math.round(stageBreakdown.attempting.value),
        warm: Math.round(stageBreakdown.warm.value),
        hot: Math.round(stageBreakdown.hot.value),
        qualified: Math.round(stageBreakdown.qualified.value),
        booked: Math.round(stageBreakdown.booked.value)
      },

      // Insurance opportunities
      insuranceOpportunityTotal: revenueStats?.insurance_opportunity_total || Math.round(insuranceOpportunityTotal),
      insuranceOpportunityCount: revenueStats?.insurance_opportunity_count || insuranceOpportunityCount,

      // Close probability averages
      avgCloseProbability: revenueStats?.avg_close_probability || (avgCloseProbability ? Math.round(avgCloseProbability * 100) / 100 : null),
      avgCloseProbabilityHot: revenueStats?.avg_close_probability_hot || null,

      // Revenue forecast
      forecast: {
        days7: revenueStats?.forecast_7_days || 0,
        days30: revenueStats?.forecast_30_days || 0,
        days90: revenueStats?.forecast_90_days || 0
      },

      // Conversion metrics
      quoteConversionRate: quoteConversionRate ? Math.round(quoteConversionRate * 100) / 100 : null,
      totalQuotesSent: revenueStats?.total_quotes_sent || totalQuotesSent,
      totalJobsWon: revenueStats?.total_jobs_won || totalJobsWon,

      // Storm revenue
      stormJobRevenue: revenueStats?.storm_job_revenue || Math.round(stormJobRevenue),
      stormJobCount: revenueStats?.storm_job_count || stormJobCount,
      stormRevenuePotential: stormRevenue?.potential_storm_revenue || null,
      stormRevenueBreakdown: stormRevenue?.storm_home_breakdown || null,
      stormRecommendedCampaigns: stormRevenue?.recommended_campaigns || null,

      // Top neighborhoods
      topNeighborhoods: topNeighborhoods,

      // Average job value
      avgJobValue: revenueStats?.avg_job_value || (contacts && contacts.length > 0
        ? Math.round(totalPipeline / contacts.length)
        : null),

      // Counts
      counts: {
        total: contacts?.length || 0,
        hot: stageBreakdown.hot.count,
        warm: stageBreakdown.warm.count,
        insurance: insuranceOpportunityCount,
        storm: stormJobCount
      },

      // Job type counts
      jobTypeCounts: {
        repair: jobTypeBreakdown.repair.count,
        replacement: jobTypeBreakdown.replacement.count,
        insurance: jobTypeBreakdown.insurance.count,
        storm: jobTypeBreakdown.storm.count,
        commercial: jobTypeBreakdown.commercial.count,
        gutter: jobTypeBreakdown.gutter.count,
        skylight: jobTypeBreakdown.skylight.count,
        misc: jobTypeBreakdown.misc.count
      }
    };

    return NextResponse.json({
      ok: true,
      dashboard: dashboardData,
      // Block 99000: Add block99000 data to response
      block99000: dashboardData.block99000,
      calculatedAt: revenueStats?.calculated_at || new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Revenue dashboard v2 error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load revenue dashboard" },
      { status: 500 }
    );
  }
}
