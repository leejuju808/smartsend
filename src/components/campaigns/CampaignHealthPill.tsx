"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CampaignHealthPillProps {
  campaignId: string;
  onClick?: () => void;
}

export function CampaignHealthPill({
  campaignId,
  onClick,
}: CampaignHealthPillProps) {
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/health`);
        if (res.ok) {
          const data = await res.json();
          setHealthScore(data.health_score || 100);
        }
      } catch (err) {
        console.error("Error fetching campaign health:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [campaignId]);

  if (loading) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const score = healthScore || 100;
  const isHealthy = score >= 80;
  const needsAttention = score >= 60 && score < 80;
  const atRisk = score < 60;

  const bgColor = isHealthy
    ? "bg-green-100 text-green-800"
    : needsAttention
    ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";

  const statusText = isHealthy
    ? "Healthy"
    : needsAttention
    ? "Needs Attention"
    : "At Risk";

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity",
        bgColor
      )}
      title={`Health Score: ${score.toFixed(0)} - ${statusText}`}
    >
      {score.toFixed(0)} — {statusText}
    </button>
  );
}
























































