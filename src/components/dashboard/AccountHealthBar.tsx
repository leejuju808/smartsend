"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface AccountHealth {
  account_id: string;
  health_score: number;
  last_30_days: {
    emails_sent: number;
    bounces_hard: number;
    bounces_soft: number;
    suppressed_sends: number;
    send_errors: number;
    replies: number;
  };
}

export function AccountHealthBar() {
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/health/account");
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      } catch (err) {
        console.error("Error fetching account health:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-gray-500">Loading health status...</div>
      </Card>
    );
  }

  if (!health) {
    return null;
  }

  const score = health.health_score;
  const isHealthy = score >= 80;
  const needsAttention = score >= 60 && score < 80;
  const atRisk = score < 60;

  const bgColor = isHealthy
    ? "bg-green-50 border-green-200"
    : needsAttention
    ? "bg-yellow-50 border-yellow-200"
    : "bg-red-50 border-red-200";

  const textColor = isHealthy
    ? "text-green-800"
    : needsAttention
    ? "text-yellow-800"
    : "text-red-800";

  const statusText = isHealthy
    ? "Healthy"
    : needsAttention
    ? "Needs Attention"
    : "At Risk";

  const totalBounces = health.last_30_days.bounces_hard + health.last_30_days.bounces_soft;
  const bounceRate =
    health.last_30_days.emails_sent > 0
      ? ((totalBounces / health.last_30_days.emails_sent) * 100).toFixed(1)
      : "0.0";

  const message = isHealthy
    ? "Your email sending looks healthy. Keep using your current domain and lead lists."
    : needsAttention
    ? "We're seeing some issues with your email sending. Review your lead lists and sending domain."
    : "We're seeing a high bounce rate. You may need to clean your lead list or update your sending domain.";

  return (
    <Card className={`p-4 ${bgColor} border-2`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm mb-1">Account Health</h3>
          <div className={`text-2xl font-bold ${textColor}`}>
            {score.toFixed(0)} — {statusText}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
        <div>
          <div className="text-gray-600">Bounces (30d)</div>
          <div className="font-semibold">
            {totalBounces} ({bounceRate}%)
          </div>
        </div>
        <div>
          <div className="text-gray-600">Suppressed</div>
          <div className="font-semibold">{health.last_30_days.suppressed_sends}</div>
        </div>
        <div>
          <div className="text-gray-600">Errors</div>
          <div className="font-semibold">{health.last_30_days.send_errors}</div>
        </div>
        <div>
          <div className="text-gray-600">Replies</div>
          <div className="font-semibold">{health.last_30_days.replies}</div>
        </div>
      </div>

      <div className={`text-sm ${textColor} font-medium`}>{message}</div>
    </Card>
  );
}
























































