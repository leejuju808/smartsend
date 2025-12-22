// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Pipeline Dashboard Component

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";

interface PipelineData {
  summary: {
    new_leads: number;
    contacted_leads: number;
    estimating_leads: number;
    quoted_leads: number;
    follow_up_needed: number;
    won_leads: number;
    lost_leads: number;
    total_leads: number;
    in_pipeline: number;
    proposals_sent: number;
    projected_revenue: number;
    close_rate_percent: number;
  };
  stages: {
    new: any[];
    contacted: any[];
    estimating: any[];
    quoted: any[];
    follow_up_needed: any[];
    won: any[];
    lost: any[];
  };
}

export function SalesPipelineDashboard({ orgId }: { orgId: string }) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPipelineData();
  }, [orgId]);

  async function fetchPipelineData() {
    try {
      const res = await fetch(`/api/sales/pipeline?org_id=${orgId}`);
      const json = await res.json();
      if (json.success) {
        setData(json.pipeline);
      }
    } catch (error) {
      console.error("Error fetching pipeline:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading pipeline...</div>;
  }

  if (!data) {
    return <div className="p-6">No pipeline data available</div>;
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales Pipeline</h1>
        <p className="text-muted-foreground">Track your sales leads and revenue</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_leads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.in_pipeline}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Proposals Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.proposals_sent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Projected Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summary.projected_revenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Stages */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              New ({summary.new_leads})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages.new.slice(0, 5).map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-2 border rounded text-sm hover:bg-muted cursor-pointer"
                >
                  <div className="font-medium">
                    {lead.customer_name || lead.first_name || "Unknown"}
                  </div>
                  {lead.lead_score && (
                    <Badge variant="outline" className="mt-1">
                      Score: {lead.lead_score}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Contacted ({summary.contacted_leads})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages.contacted.slice(0, 5).map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-2 border rounded text-sm hover:bg-muted cursor-pointer"
                >
                  <div className="font-medium">
                    {lead.customer_name || lead.first_name || "Unknown"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Estimating ({summary.estimating_leads})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages.estimating.slice(0, 5).map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-2 border rounded text-sm hover:bg-muted cursor-pointer"
                >
                  <div className="font-medium">
                    {lead.customer_name || lead.first_name || "Unknown"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Quoted ({summary.quoted_leads})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages.quoted.slice(0, 5).map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-2 border rounded text-sm hover:bg-muted cursor-pointer"
                >
                  <div className="font-medium">
                    {lead.customer_name || lead.first_name || "Unknown"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Close Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Close Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {summary.close_rate_percent.toFixed(1)}%
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {summary.won_leads} won / {summary.won_leads + summary.lost_leads} total
          </p>
        </CardContent>
      </Card>
    </div>
  );
}






















