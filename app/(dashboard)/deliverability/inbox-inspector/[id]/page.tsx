"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface InspectorReport {
  id: string;
  health_score: number;
  health_status: "healthy" | "warning" | "critical" | "unknown";
  checked_at: string;
  dns_spf_valid: boolean;
  dns_spf_record?: string;
  dns_spf_issues?: string[];
  dns_dkim_valid: boolean;
  dns_dkim_selector?: string;
  dns_dkim_record?: string;
  dns_dkim_issues?: string[];
  dns_dmarc_valid: boolean;
  dns_dmarc_policy?: string;
  dns_dmarc_record?: string;
  dns_dmarc_issues?: string[];
  dns_mx_valid: boolean;
  dns_mx_records?: string[];
  dns_a_valid: boolean;
  dns_ptr_valid: boolean;
  bounce_rate: number;
  spam_complaint_rate: number;
  engagement_open_rate: number;
  engagement_click_rate: number;
  warmup_stage?: string;
  blacklist_status?: Record<string, string>;
  spam_trap_probability?: number;
  domain_age_days?: number;
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

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 border-red-300 text-red-800";
    case "high":
      return "bg-orange-100 border-orange-300 text-orange-800";
    case "medium":
      return "bg-yellow-100 border-yellow-300 text-yellow-800";
    default:
      return "bg-blue-100 border-blue-300 text-blue-800";
  }
}

export default function InboxInspectorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const inboxId = params.id as string;

  const { data, error, isLoading, mutate } = useSWR(
    `/api/inspector/inboxes/${inboxId}`,
    fetcher
  );
  const [applying, setApplying] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const handleApplyFix = async (fixId: string) => {
    setApplying(fixId);
    try {
      const response = await fetch(`/api/inspector/fixes/${fixId}/apply`, {
        method: "POST",
      });
      if (response.ok) {
        mutate();
      } else {
        alert("Failed to apply fix");
      }
    } catch (error) {
      console.error("Apply fix error:", error);
      alert("Failed to apply fix");
    } finally {
      setApplying(null);
    }
  };

  const handleDismissFix = async (fixId: string) => {
    setDismissing(fixId);
    try {
      const response = await fetch(`/api/inspector/fixes/${fixId}/dismiss`, {
        method: "POST",
      });
      if (response.ok) {
        mutate();
      } else {
        alert("Failed to dismiss fix");
      }
    } catch (error) {
      console.error("Dismiss fix error:", error);
      alert("Failed to dismiss fix");
    } finally {
      setDismissing(null);
    }
  };

  const handleScan = async () => {
    try {
      const response = await fetch(`/api/inspector/inboxes/${inboxId}/scan`, {
        method: "POST",
      });
      if (response.ok) {
        mutate();
      } else {
        alert("Scan failed");
      }
    } catch (error) {
      console.error("Scan error:", error);
      alert("Scan failed");
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-red-600">
            Error loading report
          </div>
        </div>
      </div>
    );
  }

  const report: InspectorReport = data.report;
  const fixes: InspectorFix[] = data.fixes || [];
  const pendingFixes = fixes.filter((f) => f.status === "pending");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push("/deliverability/inbox-inspector")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Inbox Inspector
          </Button>
          <Button onClick={handleScan}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Scan
          </Button>
        </div>

        {/* Health Score Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Inbox Health Score</h2>
            <div className="text-right">
              <div className={`text-4xl font-bold ${
                report.health_score >= 80 ? "text-green-600" :
                report.health_score >= 60 ? "text-yellow-600" :
                "text-red-600"
              }`}>
                {report.health_score}/100
              </div>
              <div className="text-sm text-gray-500 capitalize">
                {report.health_status}
              </div>
            </div>
          </div>
        </Card>

        {/* DNS Validation */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">DNS Validation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>SPF</span>
                {report.dns_spf_valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
              {report.dns_spf_issues && report.dns_spf_issues.length > 0 && (
                <div className="text-sm text-red-600 ml-6">
                  {report.dns_spf_issues.join(", ")}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>DKIM</span>
                {report.dns_dkim_valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
              {report.dns_dkim_issues && report.dns_dkim_issues.length > 0 && (
                <div className="text-sm text-red-600 ml-6">
                  {report.dns_dkim_issues.join(", ")}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>DMARC</span>
                {report.dns_dmarc_valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
              {report.dns_dmarc_policy && (
                <div className="text-sm text-gray-600 ml-6">
                  Policy: {report.dns_dmarc_policy}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>MX Records</span>
                {report.dns_mx_valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Metrics */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Health Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Bounce Rate</div>
              <div className="text-lg font-semibold">
                {(report.bounce_rate * 100).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Spam Complaints</div>
              <div className="text-lg font-semibold">
                {(report.spam_complaint_rate * 100).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Open Rate</div>
              <div className="text-lg font-semibold">
                {(report.engagement_open_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Click Rate</div>
              <div className="text-lg font-semibold">
                {(report.engagement_click_rate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </Card>

        {/* Fix Recommendations */}
        {pendingFixes.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Fix Recommendations</h2>
            <div className="space-y-4">
              {pendingFixes.map((fix) => (
                <div
                  key={fix.id}
                  className={`p-4 border rounded-lg ${getSeverityColor(fix.severity)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{fix.title}</h3>
                      <p className="text-sm mb-2">{fix.description}</p>
                      {fix.ai_recommendation && (
                        <div className="text-sm italic mb-2">
                          💡 {fix.ai_recommendation}
                        </div>
                      )}
                      {fix.fix_instructions && (
                        <div className="text-sm whitespace-pre-line mt-2">
                          {fix.fix_instructions}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {fix.auto_fixable ? (
                      <Button
                        size="sm"
                        onClick={() => handleApplyFix(fix.id)}
                        disabled={applying === fix.id}
                      >
                        {applying === fix.id ? "Applying..." : "Fix It"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyFix(fix.id)}
                        disabled={applying === fix.id}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Mark as Applied
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismissFix(fix.id)}
                      disabled={dismissing === fix.id}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}



