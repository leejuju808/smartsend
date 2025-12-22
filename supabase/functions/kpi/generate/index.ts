// Block 69000 — SmartSend Roofing "Business Performance Dashboard + CEO Insights" v1
// Edge Function: /kpi/generate
// Generates daily KPIs from entire system data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workspace_id, date } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetDate = date ? new Date(date) : new Date();
    const dateString = targetDate.toISOString().split('T')[0];

    // Get all jobs for this workspace
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (jobsError) {
      throw new Error(`Error fetching jobs: ${jobsError.message}`);
    }

    // Get all leads for this workspace
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (leadsError) {
      throw new Error(`Error fetching leads: ${leadsError.message}`);
    }

    // Get profit data
    const { data: profitData } = await supabase
      .from("roofing_job_profit")
      .select("*")
      .eq("workspace_id", workspace_id);

    // Calculate revenue metrics
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let totalRevenue = 0;
    let revenueThisMonth = 0;
    let revenueThisYear = 0;
    
    if (jobs) {
      jobs.forEach((job: any) => {
        const jobDate = new Date(job.created_at);
        const jobValue = Number(job.job_value || 0);
        
        totalRevenue += jobValue;
        
        if (jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear) {
          revenueThisMonth += jobValue;
        }
        
        if (jobDate.getFullYear() === currentYear) {
          revenueThisYear += jobValue;
        }
      });
    }

    // Calculate job metrics
    const totalJobs = jobs?.length || 0;
    const completedJobs = jobs?.filter((j: any) => j.status === 'completed').length || 0;
    const inProgressJobs = jobs?.filter((j: any) => j.status === 'in_progress').length || 0;
    const scheduledJobs = jobs?.filter((j: any) => j.status === 'scheduled').length || 0;
    
    // Jobs sold this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const jobsSoldThisWeek = jobs?.filter((j: any) => {
      const jobDate = new Date(j.created_at);
      return jobDate >= weekAgo;
    }).length || 0;

    // Calculate lead metrics
    const totalLeads = leads?.length || 0;
    
    // Calculate conversion rate (leads that became jobs)
    const convertedLeads = jobs?.filter((j: any) => j.lead_id).length || 0;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    // Calculate average ticket value
    const revenuePerJob = totalJobs > 0 ? totalRevenue / totalJobs : 0;

    // Calculate profit metrics
    let totalProfit = 0;
    let totalMargin = 0;
    let profitCount = 0;
    let highestProfit = 0;
    let lowestMargin = 100;
    
    if (profitData) {
      profitData.forEach((profit: any) => {
        const profitValue = Number(profit.gross_profit || 0);
        const marginValue = Number(profit.margin || 0);
        
        totalProfit += profitValue;
        totalMargin += marginValue;
        profitCount++;
        
        if (profitValue > highestProfit) {
          highestProfit = profitValue;
        }
        
        if (marginValue > 0 && marginValue < lowestMargin) {
          lowestMargin = marginValue;
        }
      });
    }
    
    const averageMargin = profitCount > 0 ? totalMargin / profitCount : 0;

    // Calculate supplement revenue (if available in profit data)
    let supplementRevenue = 0;
    if (profitData) {
      profitData.forEach((profit: any) => {
        supplementRevenue += Number(profit.supplement_revenue || 0);
      });
    }

    // Calculate callback rate (placeholder - would need callback tracking)
    const callbackRate = 0; // TODO: Implement callback tracking

    // Calculate collections outstanding
    let collectionsOutstanding = 0;
    if (jobs) {
      jobs.forEach((job: any) => {
        collectionsOutstanding += Number(job.balance_remaining || 0);
      });
    }

    // Calculate collections risk (simple heuristic: >30 days = risk)
    let collectionsRisk = 0;
    if (jobs) {
      const now = new Date();
      const riskyJobs = jobs.filter((job: any) => {
        if (!job.updated_at || job.status !== 'completed') return false;
        const jobDate = new Date(job.updated_at);
        const daysSinceCompletion = (now.getTime() - jobDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCompletion > 30 && Number(job.balance_remaining || 0) > 0;
      }).length;
      
      collectionsRisk = totalJobs > 0 ? (riskyJobs / totalJobs) * 100 : 0;
    }

    // Calculate crew efficiency score (placeholder - would need crew performance data)
    const crewEfficiencyScore = 75; // TODO: Implement crew efficiency calculation

    // Create KPI record
    const kpiData = {
      workspace_id,
      date: dateString,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      revenue_this_month: Math.round(revenueThisMonth * 100) / 100,
      revenue_this_year: Math.round(revenueThisYear * 100) / 100,
      revenue_per_job: Math.round(revenuePerJob * 100) / 100,
      total_jobs: totalJobs,
      jobs_sold_this_week: jobsSoldThisWeek,
      jobs_completed: completedJobs,
      jobs_in_progress: inProgressJobs,
      jobs_scheduled: scheduledJobs,
      leads_received: totalLeads,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      average_ticket_value: Math.round(revenuePerJob * 100) / 100,
      average_margin: Math.round(averageMargin * 100) / 100,
      total_profit: Math.round(totalProfit * 100) / 100,
      highest_profit_job_value: highestProfit,
      lowest_margin_job_value: lowestMargin,
      supplement_revenue: Math.round(supplementRevenue * 100) / 100,
      callback_rate: callbackRate,
      job_delay_trend: 0, // TODO: Implement delay tracking
      homeowner_satisfaction: 0, // TODO: Implement satisfaction tracking
      collections_outstanding: Math.round(collectionsOutstanding * 100) / 100,
      collections_risk: Math.round(collectionsRisk * 100) / 100,
      crew_efficiency_score: crewEfficiencyScore,
    };

    // Upsert KPI record
    const { data: kpi, error: kpiError } = await supabase
      .from("business_kpis")
      .upsert(kpiData, {
        onConflict: "workspace_id,date",
      })
      .select()
      .single();

    if (kpiError) {
      throw new Error(`Error upserting KPI: ${kpiError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        kpi,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error generating KPIs:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});




























