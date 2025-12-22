import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/marketing-roi
 * 
 * Returns marketing ROI analytics including:
 * - Campaign performance
 * - Cost per lead/inspection/job
 * - ROI by campaign type
 * - Average job value per source
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const dateRange = searchParams.get("dateRange") || "30d";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get marketing ROI summary
    const { data: roiSummary, error: roiError } = await supabase
      .from("v_marketing_roi_summary")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Get detailed ROI by campaign
    const { data: campaignROI, error: campaignError } = await supabase
      .from("marketing_roi")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("calculated_at", { ascending: false })
      .limit(50);

    // Calculate date filter
    const days = parseInt(dateRange.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get campaign performance from campaigns table
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, title, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", startDate.toISOString());

    // Get leads from campaigns
    const campaignIds = campaigns?.map((c) => c.id) || [];
    const { data: campaignLeads, error: leadsError } = await supabase
      .from("leads")
      .select("id, source, campaign_id, quality_score")
      .eq("workspace_id", workspaceId)
      .in("campaign_id", campaignIds);

    // Get conversions for these leads
    const leadIds = campaignLeads?.map((l) => l.id) || [];
    const { data: conversions, error: conversionsError } = await supabase
      .from("lead_conversions")
      .select("lead_id, converted_to_inspection, converted_to_quote, converted_to_job")
      .in("lead_id", leadIds);

    // Get job values
    const convertedLeadIds =
      conversions
        ?.filter((c) => c.converted_to_job)
        .map((c) => c.lead_id) || [];
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select("lead_id, projected_job_value")
      .eq("workspace_id", workspaceId)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("lead_id", convertedLeadIds);

    // Calculate ROI by campaign
    const campaignROIDetails = (campaigns ?? []).map((campaign) => {
      const leads = campaignLeads?.filter((l) => l.campaign_id === campaign.id) || [];
      const leadIds = leads.map((l) => l.id);
      const convs = conversions?.filter((c) => leadIds.includes(c.lead_id)) || [];
      const jobLeads = convs.filter((c) => c.converted_to_job).map((c) => c.lead_id);
      const jobValues = jobs?.filter((j) => jobLeads.includes(j.lead_id)) || [];
      
      const totalLeads = leads.length;
      const inspections = convs.filter((c) => c.converted_to_inspection).length;
      const quotes = convs.filter((c) => c.converted_to_quote).length;
      const closedJobs = convs.filter((c) => c.converted_to_job).length;
      const totalJobValue = jobValues.reduce((sum, j) => sum + (Number(j.projected_job_value) || 0), 0);
      const avgJobValue = closedJobs > 0 ? totalJobValue / closedJobs : 0;
      
      // Estimate campaign cost (placeholder - should come from marketing_roi table)
      const campaignCost = 24; // Default cost for cold email campaigns
      
      return {
        campaignId: campaign.id,
        campaignName: campaign.title,
        campaignType: "cold_email", // Default
        cost: campaignCost,
        leadsGenerated: totalLeads,
        inspectionsBooked: inspections,
        jobsClosed: closedJobs,
        totalJobValue,
        avgJobValue,
        costPerLead: totalLeads > 0 ? campaignCost / totalLeads : 0,
        costPerInspection: inspections > 0 ? campaignCost / inspections : 0,
        costPerJob: closedJobs > 0 ? campaignCost / closedJobs : 0,
        roiPercentage: campaignCost > 0 ? ((totalJobValue - campaignCost) / campaignCost) * 100 : 0,
        roiMultiplier: campaignCost > 0 ? totalJobValue / campaignCost : 0,
      };
    });

    return NextResponse.json({
      summary: roiSummary || [],
      campaigns: campaignROIDetails || [],
      overall: {
        totalCost: campaignROIDetails.reduce((sum: number, c: any) => sum + c.cost, 0) || 0,
        totalLeads: campaignROIDetails.reduce((sum: number, c: any) => sum + c.leadsGenerated, 0) || 0,
        totalJobs: campaignROIDetails.reduce((sum: number, c: any) => sum + c.jobsClosed, 0) || 0,
        totalRevenue: campaignROIDetails.reduce((sum: number, c: any) => sum + c.totalJobValue, 0) || 0,
        avgROI: campaignROIDetails.length > 0
          ? campaignROIDetails.reduce((sum: number, c: any) => sum + c.roiPercentage, 0) / campaignROIDetails.length
          : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching marketing ROI:", error);
    return NextResponse.json(
      { error: "Failed to fetch marketing ROI" },
      { status: 500 }
    );
  }
}




































