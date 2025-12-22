"use client";

// Block 22052 — AI Insights Engine for Lead Source Recommendations
// Auto-generates actionable insights for each workspace

import { LeadSourcePerformance } from "./LeadSourcePage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/Card";
import { TrendingUp, TrendingDown, AlertTriangle, Target } from "lucide-react";

type LeadSourceInsightsProps = {
  performance: LeadSourcePerformance[];
};

// Format source name for display
function formatSourceName(source: string): string {
  const sourceMap: Record<string, string> = {
    google: "Google Ads",
    google_ads: "Google Ads",
    google_search: "Google Search",
    facebook: "Facebook",
    facebook_ads: "Facebook Ads",
    instagram: "Instagram",
    website_form: "Website Form",
    storm_campaign: "Storm Campaign",
    homeadvisor: "HomeAdvisor",
    angi: "Angi",
    referrals: "Referrals",
    yard_signs: "Yard Signs",
    door_knocking: "Door Knocking",
    buying_leads: "Buying Leads",
    smartsend_cold_outreach: "SmartSend Cold Outreach",
    partnership: "Partnership",
  };

  return sourceMap[source.toLowerCase()] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function LeadSourceInsights({ performance }: LeadSourceInsightsProps) {
  if (performance.length === 0) return null;

  // Find highest close rate
  const highestCloseRate = performance.reduce((max, source) => {
    const rate = source.close_rate || 0;
    return rate > (max.close_rate || 0) ? source : max;
  }, performance[0]);

  // Find highest revenue per lead
  const highestRevenuePerLead = performance.reduce((max, source) => {
    const rpl = source.revenue_per_lead || 0;
    return rpl > (max.revenue_per_lead || 0) ? source : max;
  }, performance[0]);

  // Find lowest quality score (should cut)
  const lowestQuality = performance.reduce((min, source) => {
    return source.lead_quality_score < min.lead_quality_score ? source : min;
  }, performance[0]);

  // Find sources with high momentum but low close rate (price shoppers)
  const priceShoppers = performance.filter(
    (source) =>
      (source.avg_momentum || 0) > 60 &&
      (source.close_rate || 0) < 15 &&
      source.total_leads >= 5
  );

  // Find sources with zero wins but significant leads
  const zeroWins = performance.filter(
    (source) => source.wins === 0 && source.total_leads >= 3
  );

  const insights = [];

  // Insight 1: Highest close rate
  if (highestCloseRate.close_rate && highestCloseRate.close_rate > 20) {
    insights.push({
      type: "success",
      icon: TrendingUp,
      title: `${formatSourceName(highestCloseRate.lead_source)} is producing your highest close rate`,
      message: `${highestCloseRate.close_rate.toFixed(1)}% close rate with strong homeowner tone and low risk. DOUBLE DOWN.`,
    });
  }

  // Insight 2: Highest revenue per lead
  if (
    highestRevenuePerLead.revenue_per_lead &&
    highestRevenuePerLead.revenue_per_lead > 1000 &&
    highestRevenuePerLead.lead_source !== highestCloseRate.lead_source
  ) {
    insights.push({
      type: "success",
      icon: Target,
      title: `${formatSourceName(highestRevenuePerLead.lead_source)} produces the highest revenue per lead`,
      message: `$${highestRevenuePerLead.revenue_per_lead.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} per lead. Incentivize more ${formatSourceName(highestRevenuePerLead.lead_source).toLowerCase()}.`,
    });
  }

  // Insight 3: Price shoppers
  if (priceShoppers.length > 0) {
    const source = priceShoppers[0];
    insights.push({
      type: "warning",
      icon: AlertTriangle,
      title: `${formatSourceName(source.lead_source)} leads show high momentum but collapse after proposal`,
      message: `High early engagement (${source.avg_momentum?.toFixed(0) || "N/A"} momentum) but only ${source.close_rate?.toFixed(1) || "0"}% close rate — price shoppers.`,
    });
  }

  // Insight 4: Zero wins (cut immediately)
  if (zeroWins.length > 0) {
    const source = zeroWins[0];
    insights.push({
      type: "danger",
      icon: TrendingDown,
      title: `${formatSourceName(source.lead_source)} is costing you money`,
      message: `0 wins from ${source.total_leads} leads, extremely low quality score (${source.lead_quality_score}). CUT IMMEDIATELY.`,
    });
  }

  // Insight 5: Low quality score
  if (lowestQuality.lead_quality_score < 30 && lowestQuality.total_leads >= 5) {
    insights.push({
      type: "danger",
      icon: AlertTriangle,
      title: `${formatSourceName(lowestQuality.lead_source)} has the lowest quality score`,
      message: `Quality score of ${lowestQuality.lead_quality_score} with ${lowestQuality.close_rate?.toFixed(1) || "0"}% close rate. Consider reducing spend.`,
    });
  }

  if (insights.length === 0) return null;

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          AI Insights & Recommendations
        </CardTitle>
        <CardDescription>
          SmartSend analyzes your lead sources and tells you where to spend money and where to stop
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {insights.map((insight, idx) => {
            const Icon = insight.icon;
            const bgColor =
              insight.type === "success"
                ? "bg-green-50 border-green-200"
                : insight.type === "warning"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-red-50 border-red-200";
            const iconColor =
              insight.type === "success"
                ? "text-green-600"
                : insight.type === "warning"
                ? "text-yellow-600"
                : "text-red-600";

            return (
              <div
                key={idx}
                className={`p-4 rounded-lg border ${bgColor}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 ${iconColor}`} />
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">{insight.title}</h4>
                    <p className="text-sm opacity-90">{insight.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

