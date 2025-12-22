// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Rep Performance Component

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";

interface RepPerformance {
  rep_id: string;
  rep_name: string;
  total_leads: number;
  leads_worked: number;
  estimates_created: number;
  proposals_sent: number;
  close_rate_percent: number;
  revenue_closed: number;
  avg_deal_size: number;
}

export function SalesRepPerformance({ orgId, days = 30 }: { orgId: string; days?: number }) {
  const [performance, setPerformance] = useState<RepPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformance();
  }, [orgId, days]);

  async function fetchPerformance() {
    try {
      const res = await fetch(
        `/api/sales/reps/performance?org_id=${orgId}&days=${days}`
      );
      const json = await res.json();
      if (json.success) {
        setPerformance(json.performance);
      }
    } catch (error) {
      console.error("Error fetching performance:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading performance data...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Sales Rep Performance</h2>
        <p className="text-muted-foreground">Last {days} days</p>
      </div>

      <div className="grid gap-4">
        {performance.map((rep) => (
          <Card key={rep.rep_id}>
            <CardHeader>
              <CardTitle>{rep.rep_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <div className="text-sm text-muted-foreground">Revenue Closed</div>
                  <div className="text-2xl font-bold">
                    ${rep.revenue_closed.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Close Rate</div>
                  <div className="text-2xl font-bold">
                    {rep.close_rate_percent.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Leads Worked</div>
                  <div className="text-2xl font-bold">{rep.leads_worked}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg Deal Size</div>
                  <div className="text-2xl font-bold">
                    ${rep.avg_deal_size.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Estimates:</span>{" "}
                  {rep.estimates_created}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Proposals:</span>{" "}
                  {rep.proposals_sent}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Total Leads:</span>{" "}
                  {rep.total_leads}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}






















