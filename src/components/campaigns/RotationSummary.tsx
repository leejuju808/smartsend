"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";

interface RotationSummaryData {
  inboxCount: number;
  healthScore: number;
  projectedSends: number;
  domainName: string;
}

export function RotationSummary({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<RotationSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/rotation-summary`);
        const json = await res.json();
        if (res.ok && json.summary) {
          setData(json.summary);
        }
      } catch (err) {
        console.error("Failed to load rotation summary:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  if (loading || !data) {
    return null;
  }

  const healthStatus = data.healthScore >= 75 ? "good" : data.healthScore >= 50 ? "fair" : "poor";
  const healthColor = 
    healthStatus === "good" ? "text-green-600" : 
    healthStatus === "fair" ? "text-yellow-600" : 
    "text-red-600";

  return (
    <Card className="p-4">
      <div className="text-sm font-medium mb-2">Sending Configuration</div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Sending via:</span>
          <span className="font-medium">
            {data.inboxCount} inbox{data.inboxCount !== 1 ? "es" : ""} (Auto-Rotate)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Health Score:</span>
          <span className={`font-medium ${healthColor}`}>
            {data.healthScore} ({healthStatus})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Projected Sends:</span>
          <span className="font-medium">{data.projectedSends.toLocaleString()}/day</span>
        </div>
        {data.domainName && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Domain:</span>
            <span className="font-medium">{data.domainName}</span>
          </div>
        )}
      </div>
    </Card>
  );
}



