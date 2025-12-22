"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface InspectorReport {
  id: string;
  health_score: number;
  health_status: "healthy" | "warning" | "critical" | "unknown";
  checked_at: string;
  dns_spf_valid: boolean;
  dns_dkim_valid: boolean;
  dns_dmarc_valid: boolean;
  dns_spf_issues?: string[];
  dns_dkim_issues?: string[];
  dns_dmarc_issues?: string[];
  bounce_rate: number;
  spam_complaint_rate: number;
  engagement_open_rate: number;
  warmup_stage?: string;
}

interface InspectorFix {
  id: string;
  fix_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  ai_recommendation?: string;
  fix_instructions?: string;
  auto_fixable: boolean;
  status: "pending" | "applied" | "dismissed" | "failed";
}

interface Inbox {
  id: string;
  email: string;
  sender_domains: {
    domain: string;
  };
  inbox_inspector_reports?: InspectorReport[];
  fixes?: {
    count: number;
    critical: number;
    high: number;
  };
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function getHealthBgColor(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    case "critical":
      return <XCircle className="h-5 w-5 text-red-600" />;
    default:
      return <AlertTriangle className="h-5 w-5 text-gray-400" />;
  }
}

function InboxCard({ inbox, onScan }: { inbox: Inbox; onScan: (id: string) => void }) {
  const report = inbox.inbox_inspector_reports?.[0];
  const healthScore = report?.health_score || 0;
  const healthStatus = report?.health_status || "unknown";
  const fixes = inbox.fixes || { count: 0, critical: 0, high: 0 };

  return (
    <Card className={`p-6 border-2 ${getHealthBgColor(healthScore)}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {getStatusIcon(healthStatus)}
            <h3 className="text-lg font-semibold">{inbox.email}</h3>
          </div>
          <p className="text-sm text-gray-600">{inbox.sender_domains.domain}</p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${getHealthColor(healthScore)}`}>
            {healthScore}/100
          </div>
          <div className="text-xs text-gray-500 capitalize">{healthStatus}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
        <div>
          <div className="text-gray-600">SPF</div>
          <div className={report?.dns_spf_valid ? "text-green-600" : "text-red-600"}>
            {report?.dns_spf_valid ? "✓ Valid" : "✗ Invalid"}
          </div>
        </div>
        <div>
          <div className="text-gray-600">DKIM</div>
          <div className={report?.dns_dkim_valid ? "text-green-600" : "text-red-600"}>
            {report?.dns_dkim_valid ? "✓ Valid" : "✗ Invalid"}
          </div>
        </div>
        <div>
          <div className="text-gray-600">DMARC</div>
          <div className={report?.dns_dmarc_valid ? "text-green-600" : "text-red-600"}>
            {report?.dns_dmarc_valid ? "✓ Valid" : "✗ Invalid"}
          </div>
        </div>
      </div>

      {fixes.count > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <div className="text-sm font-medium text-amber-800">
            {fixes.count} fix{fixes.count !== 1 ? "es" : ""} available
            {fixes.critical > 0 && ` (${fixes.critical} critical)`}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onScan(inbox.id)}
          className="flex-1"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Scan Now
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = `/deliverability/inbox-inspector/${inbox.id}`}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Report
        </Button>
      </div>

      {report?.checked_at && (
        <div className="mt-3 text-xs text-gray-500">
          Last checked: {new Date(report.checked_at).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

export default function InboxInspectorPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/inspector/inboxes", fetcher);
  const [scanning, setScanning] = useState<string | null>(null);

  const handleScan = async (inboxId: string) => {
    setScanning(inboxId);
    try {
      const response = await fetch(`/api/inspector/inboxes/${inboxId}/scan`, {
        method: "POST",
      });
      if (response.ok) {
        mutate(); // Refresh data
      } else {
        alert("Scan failed. Please try again.");
      }
    } catch (error) {
      console.error("Scan error:", error);
      alert("Scan failed. Please try again.");
    } finally {
      setScanning(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-red-600">
            Error loading inbox inspector data
          </div>
        </div>
      </div>
    );
  }

  const inboxes = data?.inboxes || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Inbox Inspector</h1>
          <p className="text-gray-600">
            Deep technical deliverability diagnostics for every inbox and domain
          </p>
        </div>

        {inboxes.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-gray-500">No inboxes configured yet.</p>
            <Button className="mt-4" onClick={() => window.location.href = "/settings/inboxes"}>
              Add Inbox
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {inboxes.map((inbox: Inbox) => (
              <InboxCard
                key={inbox.id}
                inbox={inbox}
                onScan={handleScan}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



