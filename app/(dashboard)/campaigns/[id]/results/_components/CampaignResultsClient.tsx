"use client";

import { useEffect, useState } from "react";
import { CampaignSummaryBanner } from "./CampaignSummaryBanner";
import { CoreMoneyMetrics } from "./CoreMoneyMetrics";
import { ROIBreakdown } from "./ROIBreakdown";
import { ReplyHeatMap } from "./ReplyHeatMap";
import { LeadTable } from "./LeadTable";
import { MessagesTimeline } from "./MessagesTimeline";
import { AIRecommendations } from "./AIRecommendations";

interface CampaignResults {
  id: string;
  campaign_id: string;
  campaign_name: string;
  total_recipients: number;
  days_running: number;
  performance_badge: "strong" | "good" | "weak";
  emails_sent: number;
  replies_received: number;
  hot_leads: number;
  estimated_job_value: number;
  hot_value: number;
  warm_value: number;
  follow_up_value: number;
  new_value: number;
  total_estimated_value: number;
  warm_leads_count: number;
  follow_up_leads_count: number;
  new_leads_count: number;
  reply_rate: number;
  calculated_at: string;
  campaign_started_at: string | null;
  campaign_finished_at: string | null;
}

interface CampaignResultsClientProps {
  campaignId: string;
  campaignName: string;
  initialResults: CampaignResults | null;
}

export function CampaignResultsClient({
  campaignId,
  campaignName,
  initialResults,
}: CampaignResultsClientProps) {
  const [results, setResults] = useState<CampaignResults | null>(initialResults);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshResults = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/results/calc`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error("Error refreshing results:", error);
    } finally {
      setRefreshing(false);
    }
  };

  if (!results) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Calculating results...</p>
          <button
            onClick={refreshResults}
            className="text-sm text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Campaign Summary Banner */}
      <CampaignSummaryBanner
        campaignName={results.campaign_name}
        totalRecipients={results.total_recipients}
        daysRunning={results.days_running}
        performanceBadge={results.performance_badge}
        onRefresh={refreshResults}
        refreshing={refreshing}
      />

      {/* Section 2: Core Money Metrics */}
      <CoreMoneyMetrics
        emailsSent={results.emails_sent}
        repliesReceived={results.replies_received}
        hotLeads={results.hot_leads}
        estimatedJobValue={results.estimated_job_value}
      />

      {/* Section 3: ROI Breakdown */}
      <ROIBreakdown
        hotLeads={results.hot_leads}
        hotValue={results.hot_value}
        warmLeads={results.warm_leads_count}
        warmValue={results.warm_value}
        followUpLeads={results.follow_up_leads_count}
        followUpValue={results.follow_up_value}
        newLeads={results.new_leads_count}
        newValue={results.new_value}
        totalEstimatedValue={results.total_estimated_value}
      />

      {/* Section 4: Reply Heat Map */}
      <ReplyHeatMap campaignId={campaignId} />

      {/* Section 5: Lead Table */}
      <LeadTable campaignId={campaignId} />

      {/* Section 6: Messages Sent Timeline */}
      <MessagesTimeline campaignId={campaignId} />

      {/* Section 7: AI Recommendations */}
      <AIRecommendations
        campaignId={campaignId}
        performanceBadge={results.performance_badge}
        replyRate={results.reply_rate}
        hotLeads={results.hot_leads}
        totalEstimatedValue={results.total_estimated_value}
      />
    </div>
  );
}





















































