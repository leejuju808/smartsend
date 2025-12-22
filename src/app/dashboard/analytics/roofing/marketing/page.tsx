"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { createClientComponentClient } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Link from "next/link";

type MarketingROIData = {
  summary: Array<{
    campaign_type: string;
    campaign_count: number;
    total_cost: number;
    total_leads: number;
    total_inspections: number;
    total_jobs: number;
    total_revenue: number;
    avg_cost_per_lead: number;
    avg_cost_per_inspection: number;
    avg_cost_per_job: number;
    overall_roi_pct: number;
    overall_roi_multiplier: number;
  }>;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    campaignType: string;
    cost: number;
    leadsGenerated: number;
    inspectionsBooked: number;
    jobsClosed: number;
    totalJobValue: number;
    avgJobValue: number;
    costPerLead: number;
    costPerInspection: number;
    costPerJob: number;
    roiPercentage: number;
    roiMultiplier: number;
  }>;
  overall: {
    totalCost: number;
    totalLeads: number;
    totalJobs: number;
    totalRevenue: number;
    avgROI: number;
  };
};

export default function MarketingROIPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<MarketingROIData | null>(null);
  const [dateRange, setDateRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const loadData = async () => {
      try {
        const res = await fetch(
          `/api/analytics/marketing-roi?workspaceId=${workspaceId}&dateRange=${dateRange}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error loading marketing ROI:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId, dateRange]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading outreach ROI...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No outreach ROI data available.</div>
      </div>
    );
  }

  const roiData = data.campaigns.map((campaign) => ({
    name: campaign.campaignName || campaign.campaignId.slice(0, 8),
    roi: campaign.roiPercentage,
    revenue: campaign.totalJobValue,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Outreach ROI</h1>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </Select>
          <Link href="/dashboard/analytics/roofing">
            <button className="px-4 py-2 text-sm bg-muted rounded-md">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>

      {/* Overall Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.overall.totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overall.totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overall.totalJobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(data.overall.totalRevenue / 1000).toFixed(1)}K
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg ROI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data.overall.avgROI.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROI Chart */}
      {data.campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">ROI by Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roiData}>
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="roi" fill="#00C49F" name="ROI %" />
                <Bar dataKey="revenue" fill="#0088FE" name="Revenue ($)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Campaign Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH className="text-right">Type</TH>
                <TH className="text-right">Cost</TH>
                <TH className="text-right">Leads</TH>
                <TH className="text-right">Inspections</TH>
                <TH className="text-right">Jobs</TH>
                <TH className="text-right">Cost/Lead</TH>
                <TH className="text-right">Cost/Inspection</TH>
                <TH className="text-right">Cost/Job</TH>
                <TH className="text-right">Total Revenue</TH>
                <TH className="text-right">ROI %</TH>
                <TH className="text-right">ROI Multiplier</TH>
              </TR>
            </THead>
            <TBody>
              {data.campaigns.map((campaign) => (
                <TR key={campaign.campaignId}>
                  <TD className="font-medium">
                    {campaign.campaignName || campaign.campaignId.slice(0, 8)}
                  </TD>
                  <TD className="text-right">{campaign.campaignType}</TD>
                  <TD className="text-right">${campaign.cost.toFixed(2)}</TD>
                  <TD className="text-right">{campaign.leadsGenerated}</TD>
                  <TD className="text-right">{campaign.inspectionsBooked}</TD>
                  <TD className="text-right">{campaign.jobsClosed}</TD>
                  <TD className="text-right">
                    ${campaign.costPerLead.toFixed(2)}
                  </TD>
                  <TD className="text-right">
                    ${campaign.costPerInspection.toFixed(2)}
                  </TD>
                  <TD className="text-right">
                    ${campaign.costPerJob.toFixed(2)}
                  </TD>
                  <TD className="text-right">
                    ${(campaign.totalJobValue / 1000).toFixed(1)}K
                  </TD>
                  <TD className="text-right">
                    <span className={campaign.roiPercentage > 0 ? "text-green-600" : "text-red-600"}>
                      {campaign.roiPercentage.toFixed(1)}%
                    </span>
                  </TD>
                  <TD className="text-right">
                    {campaign.roiMultiplier.toFixed(2)}x
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary by Type */}
      {data.summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">ROI Summary by Campaign Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Campaign Type</TH>
                  <TH className="text-right">Campaigns</TH>
                  <TH className="text-right">Total Cost</TH>
                  <TH className="text-right">Total Leads</TH>
                  <TH className="text-right">Total Jobs</TH>
                  <TH className="text-right">Total Revenue</TH>
                  <TH className="text-right">Avg Cost/Lead</TH>
                  <TH className="text-right">Avg Cost/Job</TH>
                  <TH className="text-right">ROI %</TH>
                  <TH className="text-right">ROI Multiplier</TH>
                </TR>
              </THead>
              <TBody>
                {data.summary.map((summary) => (
                  <TR key={summary.campaign_type}>
                    <TD className="font-medium">{summary.campaign_type}</TD>
                    <TD className="text-right">{summary.campaign_count}</TD>
                    <TD className="text-right">${summary.total_cost.toFixed(2)}</TD>
                    <TD className="text-right">{summary.total_leads}</TD>
                    <TD className="text-right">{summary.total_jobs}</TD>
                    <TD className="text-right">
                      ${(summary.total_revenue / 1000).toFixed(1)}K
                    </TD>
                    <TD className="text-right">
                      ${summary.avg_cost_per_lead.toFixed(2)}
                    </TD>
                    <TD className="text-right">
                      ${summary.avg_cost_per_job.toFixed(2)}
                    </TD>
                    <TD className="text-right">
                      <span className={summary.overall_roi_pct > 0 ? "text-green-600" : "text-red-600"}>
                        {summary.overall_roi_pct.toFixed(1)}%
                      </span>
                    </TD>
                    <TD className="text-right">
                      {summary.overall_roi_multiplier.toFixed(2)}x
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}




































