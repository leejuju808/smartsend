"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface CampaignSummaryBannerProps {
  campaignName: string;
  totalRecipients: number;
  daysRunning: number;
  performanceBadge: "strong" | "good" | "weak";
  onRefresh: () => void;
  refreshing: boolean;
}

export function CampaignSummaryBanner({
  campaignName,
  totalRecipients,
  daysRunning,
  performanceBadge,
  onRefresh,
  refreshing,
}: CampaignSummaryBannerProps) {
  const badgeColors = {
    strong: "bg-green-500/10 text-green-700 border-green-500/20",
    good: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    weak: "bg-red-500/10 text-red-700 border-red-500/20",
  };

  const badgeLabels = {
    strong: "Strong",
    good: "Good",
    weak: "Weak",
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaignName}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Sent to {totalRecipients.toLocaleString()} homeowners</span>
            <span>•</span>
            <span>Running for {daysRunning} {daysRunning === 1 ? "day" : "days"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={`${badgeColors[performanceBadge]} border font-semibold`}
          >
            Performance: {badgeLabels[performanceBadge]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}





















































