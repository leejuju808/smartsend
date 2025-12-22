"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface CampaignHealth {
  campaign_id: string;
  emails_sent: number;
  bounces_hard: number;
  bounces_soft: number;
  suppressed_sends: number;
  send_errors: number;
  opens: number;
  replies: number;
  health_score: number;
}

interface Issue {
  id: string;
  event_type: string;
  message: string;
  campaign_id: string;
  campaign_name: string;
  contact_email: string;
  timestamp: string;
  error_code?: string;
  error_message?: string;
}

interface CampaignHealthDrawerProps {
  campaignId: string;
  campaignName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CampaignHealthDrawer({
  campaignId,
  campaignName,
  isOpen,
  onClose,
}: CampaignHealthDrawerProps) {
  const [health, setHealth] = useState<CampaignHealth | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !campaignId) return;

    async function fetchData() {
      try {
        const [healthRes, issuesRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}/health`),
          fetch(`/api/health/issues?campaignId=${campaignId}&limit=20`),
        ]);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setHealth(healthData);
        }

        if (issuesRes.ok) {
          const issuesData = await issuesRes.json();
          setIssues(issuesData.issues || []);
        }
      } catch (err) {
        console.error("Error fetching campaign health:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isOpen, campaignId]);

  if (!isOpen) return null;

  const score = health?.health_score || 100;
  const isHealthy = score >= 80;
  const needsAttention = score >= 60 && score < 80;
  const atRisk = score < 60;

  const scoreColor = isHealthy
    ? "text-green-600"
    : needsAttention
    ? "text-yellow-600"
    : "text-red-600";

  const totalBounces = (health?.bounces_hard || 0) + (health?.bounces_soft || 0);
  const bounceRate =
    health && health.emails_sent > 0
      ? ((totalBounces / health.emails_sent) * 100).toFixed(1)
      : "0.0";

  const replyRate =
    health && health.emails_sent > 0
      ? ((health.replies / health.emails_sent) * 100).toFixed(1)
      : "0.0";

  // Check for high bounce rate warning
  const hasHighBounceRate =
    health && health.emails_sent > 200 && parseFloat(bounceRate) > 5;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Health for {campaignName}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Health Score */}
              <Card className="p-6">
                <div className="text-sm text-gray-600 mb-2">Health Score</div>
                <div className={`text-4xl font-bold ${scoreColor}`}>
                  {score.toFixed(1)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {isHealthy
                    ? "Healthy"
                    : needsAttention
                    ? "Needs Attention"
                    : "At Risk"}
                </div>
              </Card>

              {/* High Bounce Rate Warning */}
              {hasHighBounceRate && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="font-semibold text-yellow-800 mb-1">
                    High Bounce Rate Detected
                  </div>
                  <div className="text-sm text-yellow-700">
                    We're seeing a bounce rate of {bounceRate}% on this campaign.
                    We recommend cleaning your email list before sending more to
                    avoid deliverability issues.
                  </div>
                </div>
              )}

              {/* Metrics */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Metrics</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Emails Sent</div>
                    <div className="font-semibold text-lg">
                      {health?.emails_sent || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Hard Bounces</div>
                    <div className="font-semibold text-lg text-red-600">
                      {health?.bounces_hard || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Soft Bounces</div>
                    <div className="font-semibold text-lg text-yellow-600">
                      {health?.bounces_soft || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Bounce Rate</div>
                    <div className="font-semibold text-lg">{bounceRate}%</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Suppressed Sends</div>
                    <div className="font-semibold text-lg">
                      {health?.suppressed_sends || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Send Errors</div>
                    <div className="font-semibold text-lg text-red-600">
                      {health?.send_errors || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Reply Rate</div>
                    <div className="font-semibold text-lg">{replyRate}%</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Replies</div>
                    <div className="font-semibold text-lg text-green-600">
                      {health?.replies || 0}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Recent Issues */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Recent Issues</h3>
                {issues.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No recent issues. All good!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {issues.map((issue) => (
                      <div
                        key={issue.id}
                        className="border rounded-lg p-3 text-sm"
                      >
                        <div className="font-medium mb-1">{issue.message}</div>
                        <div className="text-gray-500 text-xs">
                          {new Date(issue.timestamp).toLocaleString()}
                        </div>
                        {issue.error_message && (
                          <div className="text-gray-600 text-xs mt-1">
                            {issue.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
























































