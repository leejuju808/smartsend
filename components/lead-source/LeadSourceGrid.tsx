"use client";

// Block 22052 — Lead Source Grid (Scoreboard)
// Shows each source as a card with key metrics

import { LeadSourcePerformance } from "./LeadSourcePage";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type LeadSourceGridProps = {
  sources: LeadSourcePerformance[];
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
    referral: "Referral",
    referrals: "Referrals",
    yard_signs: "Yard Signs",
    door_knocking: "Door Knocking",
    buying_leads: "Buying Leads",
    smartsend_cold_outreach: "SmartSend Outreach",
    cold_email: "SmartSend Outreach",
    email_outreach: "SmartSend Outreach",
    partnership: "Partnership",
  };

  return sourceMap[source.toLowerCase()] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Get quality score color
function getQualityColor(score: number): string {
  if (score >= 75) return "border-green-500 bg-green-50";
  if (score >= 50) return "border-yellow-500 bg-yellow-50";
  return "border-red-500 bg-red-50";
}

// Get quality score text color
function getQualityTextColor(score: number): string {
  if (score >= 75) return "text-green-700";
  if (score >= 50) return "text-yellow-700";
  return "text-red-700";
}

export function LeadSourceGrid({ sources }: LeadSourceGridProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Lead Source Scoreboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sources.map((source) => (
          <Card
            key={source.id}
            className={cn(
              "transition-all hover:shadow-lg",
              getQualityColor(source.lead_quality_score)
            )}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{formatSourceName(source.lead_source)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Quality Score */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Quality Score</span>
                <span
                  className={cn(
                    "text-2xl font-bold",
                    getQualityTextColor(source.lead_quality_score)
                  )}
                >
                  {source.lead_quality_score}
                </span>
              </div>

              {/* Close Rate */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Close Rate</span>
                <span className="text-sm font-semibold">
                  {source.close_rate ? `${source.close_rate.toFixed(1)}%` : "N/A"}
                </span>
              </div>

              {/* Revenue Generated */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Revenue</span>
                <span className="text-sm font-semibold">
                  ${source.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* Revenue Per Lead */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Revenue/Lead</span>
                <span className="text-sm font-semibold">
                  {source.revenue_per_lead
                    ? `$${source.revenue_per_lead.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "$0"}
                </span>
              </div>

              {/* Avg Job Size */}
              {source.avg_job_size && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Avg Job Size</span>
                  <span className="text-sm font-semibold">
                    ${source.avg_job_size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}

              {/* Risk Mix */}
              <div className="pt-2 border-t">
                <div className="text-xs text-gray-500 mb-1">Risk Distribution</div>
                <div className="flex gap-1">
                  {source.risk_low > 0 && (
                    <div className="flex-1 bg-green-200 rounded h-2" title={`Low: ${source.risk_low}`} />
                  )}
                  {source.risk_med > 0 && (
                    <div className="flex-1 bg-yellow-200 rounded h-2" title={`Medium: ${source.risk_med}`} />
                  )}
                  {source.risk_high > 0 && (
                    <div className="flex-1 bg-orange-200 rounded h-2" title={`High: ${source.risk_high}`} />
                  )}
                  {source.risk_critical > 0 && (
                    <div className="flex-1 bg-red-200 rounded h-2" title={`Critical: ${source.risk_critical}`} />
                  )}
                </div>
              </div>

              {/* Stats Summary */}
              <div className="pt-2 border-t text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Total Leads: {source.total_leads}</span>
                  <span>Wins: {source.wins}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

