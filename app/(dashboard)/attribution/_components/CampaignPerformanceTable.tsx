/**
 * Block 93000 — Campaign Performance Table
 * Shows campaign-level ROI and conversion metrics
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface CampaignPerformance {
  id: string;
  campaign_name: string;
  medium: string;
  offer: string | null;
  total_leads: number;
  booked_estimates: number;
  jobs_won: number;
  total_revenue: number;
  total_cost: number;
  roi_percentage: number | null;
  close_rate: number;
}

export function CampaignPerformanceTable() {
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/attribution?days=30")
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(data.campaign_performance || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load campaign performance:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-center py-8">Loading campaign performance...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Performance</CardTitle>
        <CardDescription>
          ROI, conversion rates, and revenue by campaign
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold">Campaign</th>
                <th className="text-left py-3 px-4 font-semibold">Medium</th>
                <th className="text-left py-3 px-4 font-semibold">Offer</th>
                <th className="text-right py-3 px-4 font-semibold">Leads</th>
                <th className="text-right py-3 px-4 font-semibold">Booked</th>
                <th className="text-right py-3 px-4 font-semibold">Jobs Won</th>
                <th className="text-right py-3 px-4 font-semibold">Revenue</th>
                <th className="text-right py-3 px-4 font-semibold">Cost</th>
                <th className="text-right py-3 px-4 font-semibold">ROI</th>
                <th className="text-right py-3 px-4 font-semibold">Close Rate</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-500">
                    No campaign data yet. Campaigns will appear here as leads are attributed.
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{campaign.campaign_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {campaign.medium}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {campaign.offer || "—"}
                    </td>
                    <td className="text-right py-3 px-4">{campaign.total_leads}</td>
                    <td className="text-right py-3 px-4">{campaign.booked_estimates}</td>
                    <td className="text-right py-3 px-4">{campaign.jobs_won}</td>
                    <td className="text-right py-3 px-4 font-medium">
                      {formatCurrency(parseFloat(campaign.total_revenue.toString()))}
                    </td>
                    <td className="text-right py-3 px-4">
                      {formatCurrency(parseFloat(campaign.total_cost.toString()))}
                    </td>
                    <td className="text-right py-3 px-4">
                      {campaign.roi_percentage !== null ? (
                        <span
                          className={
                            campaign.roi_percentage >= 0 ? "text-green-600" : "text-red-600"
                          }
                        >
                          {campaign.roi_percentage >= 0 ? "+" : ""}
                          {campaign.roi_percentage.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="text-right py-3 px-4">
                      {campaign.close_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}



























