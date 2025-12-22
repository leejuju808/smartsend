"use client";

// Block 22052 — Lead Source Table (Detailed Intelligence)
// Comprehensive table showing all metrics for each source

import { LeadSourcePerformance } from "./LeadSourcePage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";

type LeadSourceTableProps = {
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

// Get quality badge color
function getQualityBadgeClass(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-800 border-green-300";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-red-100 text-red-800 border-red-300";
}

export function LeadSourceTable({ sources }: LeadSourceTableProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Source Intelligence Table</h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                  <TableHead className="text-right">Total Leads</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Losses</TableHead>
                  <TableHead className="text-right">Close Rate</TableHead>
                  <TableHead className="text-right">Avg Job Size</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Revenue/Lead</TableHead>
                  <TableHead className="text-right">Avg Health</TableHead>
                  <TableHead className="text-right">Risk Mix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">
                      {formatSourceName(source.lead_source)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded text-xs font-semibold border",
                          getQualityBadgeClass(source.lead_quality_score)
                        )}
                      >
                        {source.lead_quality_score}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{source.total_leads}</TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {source.wins}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {source.losses}
                    </TableCell>
                    <TableCell className="text-right">
                      {source.close_rate
                        ? `${source.close_rate.toFixed(1)}%`
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      {source.avg_job_size
                        ? `$${source.avg_job_size.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}`
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${source.total_revenue.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {source.revenue_per_lead
                        ? `$${source.revenue_per_lead.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}`
                        : "$0"}
                    </TableCell>
                    <TableCell className="text-right">
                      {source.avg_health
                        ? source.avg_health.toFixed(1)
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {source.risk_low > 0 && (
                          <span
                            className="text-xs bg-green-100 text-green-800 px-1 rounded"
                            title={`Low: ${source.risk_low}`}
                          >
                            L:{source.risk_low}
                          </span>
                        )}
                        {source.risk_med > 0 && (
                          <span
                            className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded"
                            title={`Medium: ${source.risk_med}`}
                          >
                            M:{source.risk_med}
                          </span>
                        )}
                        {source.risk_high > 0 && (
                          <span
                            className="text-xs bg-orange-100 text-orange-800 px-1 rounded"
                            title={`High: ${source.risk_high}`}
                          >
                            H:{source.risk_high}
                          </span>
                        )}
                        {source.risk_critical > 0 && (
                          <span
                            className="text-xs bg-red-100 text-red-800 px-1 rounded"
                            title={`Critical: ${source.risk_critical}`}
                          >
                            C:{source.risk_critical}
                          </span>
                        )}
                        {source.risk_low === 0 &&
                          source.risk_med === 0 &&
                          source.risk_high === 0 &&
                          source.risk_critical === 0 && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

