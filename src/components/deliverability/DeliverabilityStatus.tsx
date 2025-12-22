"use client";

// Block 20930 — Deliverability Status Component
// Displays domain deliverability status in Settings

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface DeliverabilityStatusProps {
  domainSettingsId: string;
}

interface DeliverabilityData {
  domain: string;
  score: number;
  score_label: string;
  spf: {
    status: "pass" | "warn" | "fail";
    pass: boolean;
    record?: string;
  };
  dkim: {
    status: "pass" | "warn" | "fail";
    pass: boolean;
    record?: string;
  };
  dmarc: {
    status: "pass" | "warn" | "fail";
    pass: boolean;
    record?: string;
  };
  warmup: {
    status: string;
    progress: number;
    current_limit: number;
    stage: number;
  };
  bounce_rate_30d: number;
  complaint_rate_30d: number;
  sending_paused: boolean;
  pause_reason?: string;
}

export function DeliverabilityStatus({ domainSettingsId }: DeliverabilityStatusProps) {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/deliverability/status/${domainSettingsId}`);
        const json = await res.json();
        
        if (!res.ok) {
          throw new Error(json.error || "Failed to fetch deliverability status");
        }
        
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, [domainSettingsId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{error || "Failed to load deliverability status"}</p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 55) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return "bg-green-50 border-green-200";
    if (score >= 70) return "bg-blue-50 border-blue-200";
    if (score >= 55) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  const StatusIcon = ({ status }: { status: "pass" | "warn" | "fail" }) => {
    if (status === "pass") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === "warn") return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Domain Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{data.domain}</h2>
        <p className="text-sm text-gray-500 mt-1">Deliverability Status</p>
      </div>

      {/* Sending Paused Alert */}
      {data.sending_paused && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">
                🚨 Sending Paused to Protect Your Domain
              </h3>
              <p className="text-sm text-red-700 mt-1">{data.pause_reason}</p>
              <button className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline">
                Fix Domain (opens DNS instructions)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliverability Score */}
      <div className={`rounded-lg border p-6 ${getScoreBgColor(data.score)}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Current Score</p>
            <p className={`text-4xl font-bold mt-1 ${getScoreColor(data.score)}`}>
              {data.score.toFixed(0)}
            </p>
            <p className={`text-sm font-medium mt-1 ${getScoreColor(data.score)}`}>
              {data.score_label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Bounce Rate (30d)</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {data.bounce_rate_30d.toFixed(2)}%
            </p>
            <p className="text-sm text-gray-600 mt-2">Complaint Rate (30d)</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {data.complaint_rate_30d.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* DNS Authentication Status */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Domain Authentication</h3>
        <div className="space-y-4">
          {/* SPF */}
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <StatusIcon status={data.spf.status} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">SPF</p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.spf.status === "pass" && "✓ SPF configured"}
                  {data.spf.status === "warn" && "⚠ SPF partial"}
                  {data.spf.status === "fail" && "✗ SPF missing"}
                </p>
                {data.spf.record && (
                  <p className="text-xs font-mono text-gray-600 mt-1 break-all">
                    {data.spf.record}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* DKIM */}
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <StatusIcon status={data.dkim.status} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">DKIM</p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.dkim.status === "pass" && "✓ DKIM configured"}
                  {data.dkim.status === "warn" && "⚠ DKIM partial"}
                  {data.dkim.status === "fail" && "✗ DKIM missing"}
                </p>
                {data.dkim.record && (
                  <p className="text-xs font-mono text-gray-600 mt-1 break-all">
                    {data.dkim.record.substring(0, 100)}...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* DMARC */}
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <StatusIcon status={data.dmarc.status} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">DMARC</p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.dmarc.status === "pass" && "✓ DMARC configured"}
                  {data.dmarc.status === "warn" && "⚠ DMARC in 'none' mode (recommended)"}
                  {data.dmarc.status === "fail" && "✗ DMARC missing"}
                </p>
                {data.dmarc.record && (
                  <p className="text-xs font-mono text-gray-600 mt-1 break-all">
                    {data.dmarc.record}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warm-Up Status */}
      {data.warmup.status !== "completed" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Domain Warm-Up</h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm font-semibold text-gray-900">
                  {data.warmup.progress.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${data.warmup.progress}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Current Limit</span>
              <span className="font-semibold text-gray-900">
                {data.warmup.current_limit} emails/day
              </span>
            </div>
            {data.warmup.stage < 15 && (
              <p className="text-xs text-gray-600 mt-2">
                Projected Unlock: {15 - data.warmup.stage} days
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          {data.dmarc.status === "fail" && (
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Add DMARC record for better inbox placement</span>
            </li>
          )}
          {data.dkim.status === "fail" && (
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Configure DKIM selector to improve authentication</span>
            </li>
          )}
          {data.bounce_rate_30d > 2 && (
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Bounce rate is elevated. Review your contact list quality</span>
            </li>
          )}
          {data.complaint_rate_30d > 0.1 && (
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Complaint rate is high. Review email content and frequency</span>
            </li>
          )}
          {data.warmup.status === "warming" && (
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Continue warm-up process to unlock higher sending limits</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
















































