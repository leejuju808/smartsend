"use client";

// Block 22052 — SmartSend Roofing Lead Source Performance Brain v1
// Lead Source Performance Page — Shows which sources make money and which burn cash

import { useEffect, useState } from "react";
import { LeadSourceGrid } from "./LeadSourceGrid";
import { LeadSourceTable } from "./LeadSourceTable";
import { LeadSourceInsights } from "./LeadSourceInsights";
import { Card, CardContent } from "../ui/card";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

export type LeadSourcePerformance = {
  id: string;
  workspace_id: string;
  lead_source: string;
  total_leads: number;
  wins: number;
  losses: number;
  active_leads: number;
  close_rate: number | null;
  avg_job_size: number | null;
  total_revenue: number;
  avg_health: number | null;
  avg_momentum: number | null;
  avg_experience: number | null;
  risk_low: number;
  risk_med: number;
  risk_high: number;
  risk_critical: number;
  lead_quality_score: number;
  revenue_per_lead: number | null;
  updated_at: string;
};

type LeadSourcePageProps = {
  workspaceId: string;
};

export function LeadSourcePage({ workspaceId }: LeadSourcePageProps) {
  const [performance, setPerformance] = useState<LeadSourcePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createBrowserClient();

  const sortSourcesMonopolyStyle = (rows: LeadSourcePerformance[]) => {
    const priority = (s: string) => {
      const v = (s || "").toLowerCase();
      if (
        v.includes("smartsend") ||
        v.includes("cold_outreach") ||
        v.includes("cold outreach") ||
        v.includes("outreach") ||
        v.includes("sequence") ||
        v.includes("campaign")
      )
        return 3; // foundation
      if (v.includes("referral")) return 2; // bonus
      if (v.includes("google") || v.includes("facebook") || v.includes("ads"))
        return 1; // background noise
      return 0;
    };

    return [...rows].sort((a, b) => {
      const p = priority(b.lead_source) - priority(a.lead_source);
      if (p !== 0) return p;
      return (b.lead_quality_score || 0) - (a.lead_quality_score || 0);
    });
  };

  useEffect(() => {
    async function fetchPerformance() {
      try {
        setLoading(true);
        setError(null);

        // Fetch performance data
        const { data, error: fetchError } = await supabase
          .from("lead_source_performance")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("lead_quality_score", { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        // If no data, trigger update
        if (!data || data.length === 0) {
          // Call edge function to update performance
          const { error: updateError } = await supabase.functions.invoke(
            "update-lead-source-performance",
            {
              body: { workspace_id: workspaceId },
            }
          );

          if (updateError) {
            console.error("Error updating performance:", updateError);
          }

          // Retry fetch after a short delay
          setTimeout(async () => {
            const { data: retryData, error: retryError } = await supabase
              .from("lead_source_performance")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("lead_quality_score", { ascending: false });

            if (!retryError && retryData) {
              setPerformance(retryData);
            }
            setLoading(false);
          }, 2000);
          return;
        }

        setPerformance(sortSourcesMonopolyStyle(data || []));
      } catch (err) {
        console.error("Error fetching lead source performance:", err);
        setError(err instanceof Error ? err.message : "Failed to load performance data");
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      fetchPerformance();
    }
  }, [workspaceId, supabase]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-400">Loading lead source performance...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Lead Source Performance</h1>
        <p className="text-gray-600">
          Which lead sources are making you money — and which ones are burning cash
        </p>
      </div>

      {/* AI Insights */}
      {performance.length > 0 && (
        <LeadSourceInsights performance={performance} />
      )}

      {/* Lead Source Grid (Scoreboard) */}
      {performance.length > 0 && (
        <LeadSourceGrid sources={performance} />
      )}

      {/* Lead Source Table (Detailed Intelligence) */}
      {performance.length > 0 ? (
        <LeadSourceTable sources={performance} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">
              No lead source data available. Create some leads with lead sources to see performance metrics.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

