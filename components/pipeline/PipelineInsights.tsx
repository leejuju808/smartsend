// Block 14000 — Pipeline Insights Component
// Shows pipeline metrics at the top of the board

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Insights = {
  stage_counts: {
    HOT: number;
    WARM: number;
    FOLLOW_UP: number;
    COLD: number;
    NOT_INTERESTED: number;
  };
  total_leads: number;
  average_lead_score: number;
  estimated_revenue: number;
  hot_leads: number;
  hot_conversion_rate: number;
};

type Props = {
  insights: Insights;
};

export function PipelineInsights({ insights }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Insights</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Stage Counts */}
          <div>
            <div className="text-sm text-gray-600 mb-1">🔥 HOT Leads</div>
            <div className="text-2xl font-bold text-red-600">
              {insights.stage_counts.HOT}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">🟨 WARM Leads</div>
            <div className="text-2xl font-bold text-yellow-600">
              {insights.stage_counts.WARM}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">🟦 Follow-Up</div>
            <div className="text-2xl font-bold text-blue-600">
              {insights.stage_counts.FOLLOW_UP}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">⬜ COLD Leads</div>
            <div className="text-2xl font-bold text-gray-600">
              {insights.stage_counts.COLD}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">🟫 Not Interested</div>
            <div className="text-2xl font-bold text-brown-600">
              {insights.stage_counts.NOT_INTERESTED}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-gray-600 mb-1">Total Leads</div>
            <div className="text-xl font-semibold">{insights.total_leads}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Avg Lead Score</div>
            <div className="text-xl font-semibold">
              {insights.average_lead_score}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Est. Revenue</div>
            <div className="text-xl font-semibold text-green-600">
              ${insights.estimated_revenue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">HOT Conversion</div>
            <div className="text-xl font-semibold">
              {insights.hot_conversion_rate}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





















































