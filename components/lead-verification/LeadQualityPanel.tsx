/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * Lead Quality Panel Component
 * Displays comprehensive lead verification results and quality score
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Home,
  Target,
  Shield,
  Copy,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface LeadQualityData {
  verification: any;
  quality_score: number;
  quality_category: "high" | "medium" | "low" | "junk";
  red_alerts: string[];
  quality_history?: any[];
  timeline?: any[];
  intent?: any;
  spam?: any;
  duplicates?: any[];
}

interface LeadQualityPanelProps {
  contactId?: string;
  leadId?: string;
  type?: "contact" | "lead";
}

export function LeadQualityPanel({
  contactId,
  leadId,
  type = "contact",
}: LeadQualityPanelProps) {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [data, setData] = useState<LeadQualityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQualityData = async () => {
    try {
      setLoading(true);
      const id = contactId || leadId;
      if (!id) return;

      const response = await fetch(
        `/api/lead/quality/${id}?type=${type}`
      );
      if (!response.ok) {
        throw new Error("Failed to load quality data");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setVerifying(true);
      const response = await fetch("/api/lead/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          lead_id: leadId,
          force_reverify: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Verification failed");
      }

      // Reload data
      await loadQualityData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    loadQualityData();
  }, [contactId, leadId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Lead Quality</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Lead Quality</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-500">{error}</div>
          <Button
            onClick={loadQualityData}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.verification) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Lead Quality</CardTitle>
          <Button
            onClick={handleVerify}
            disabled={verifying}
            variant="outline"
            size="sm"
          >
            {verifying ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Verify Lead
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No verification data available. Click "Verify Lead" to run verification checks.
          </div>
        </CardContent>
      </Card>
    );
  }

  const verification = data.verification;
  const qualityScore = data.quality_score || verification.quality_score || 0;
  const qualityCategory =
    data.quality_category || verification.quality_category || "junk";
  const redAlerts = data.red_alerts || verification.red_alerts || [];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "high":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            High Quality
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
            Medium Quality
          </Badge>
        );
      case "low":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
            Low Quality
          </Badge>
        );
      case "junk":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            Junk
          </Badge>
        );
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "valid":
      case "verified":
      case "relevant":
      case "in_territory":
      case "unique":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "risky":
      case "likely":
      case "maybe":
      case "suspicious":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "invalid":
      case "unlikely":
      case "irrelevant":
      case "out_of_area":
      case "duplicate":
      case "spam":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; label: string }> = {
      valid: { color: "bg-green-100 text-green-800", label: "Valid" },
      verified: { color: "bg-green-100 text-green-800", label: "Verified" },
      risky: { color: "bg-yellow-100 text-yellow-800", label: "Risky" },
      invalid: { color: "bg-red-100 text-red-800", label: "Invalid" },
      unknown: { color: "bg-gray-100 text-gray-800", label: "Unknown" },
      relevant: { color: "bg-green-100 text-green-800", label: "Relevant" },
      maybe: { color: "bg-yellow-100 text-yellow-800", label: "Maybe" },
      irrelevant: { color: "bg-red-100 text-red-800", label: "Irrelevant" },
      in_territory: { color: "bg-green-100 text-green-800", label: "In Territory" },
      out_of_area: { color: "bg-red-100 text-red-800", label: "Out of Area" },
      unique: { color: "bg-green-100 text-green-800", label: "Unique" },
      duplicate: { color: "bg-red-100 text-red-800", label: "Duplicate" },
      clean: { color: "bg-green-100 text-green-800", label: "Clean" },
      suspicious: { color: "bg-yellow-100 text-yellow-800", label: "Suspicious" },
      spam: { color: "bg-red-100 text-red-800", label: "Spam" },
    };

    const statusInfo = statusMap[status] || {
      color: "bg-gray-100 text-gray-800",
      label: status,
    };

    return (
      <Badge className={`${statusInfo.color} text-xs`}>{statusInfo.label}</Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Lead Quality</CardTitle>
        <Button
          onClick={handleVerify}
          disabled={verifying}
          variant="outline"
          size="sm"
        >
          {verifying ? (
            <>
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-verify
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quality Score */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Quality Score
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-2xl font-bold ${getScoreColor(qualityScore)}`}
              >
                {qualityScore}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
              {getCategoryBadge(qualityCategory)}
            </div>
          </div>
          {qualityScore >= 90 && (
            <TrendingUp className="h-5 w-5 text-green-600" />
          )}
          {qualityScore < 40 && (
            <TrendingDown className="h-5 w-5 text-red-600" />
          )}
        </div>

        {/* Red Alerts */}
        {redAlerts.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Red Alerts
            </div>
            <div className="flex flex-wrap gap-1">
              {redAlerts.map((alert, idx) => (
                <Badge
                  key={idx}
                  variant="destructive"
                  className="text-xs"
                >
                  {alert.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Verification Categories */}
        <div className="space-y-3">
          <div className="text-xs font-semibold mb-2">Verification Details</div>

          {/* Email */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3 text-muted-foreground" />
              <span>Email</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.email_verification_status)}
              {getStatusBadge(verification.email_verification_status)}
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span>Phone</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.phone_verification_status)}
              {getStatusBadge(verification.phone_verification_status)}
              {verification.phone_type && (
                <span className="text-muted-foreground">
                  ({verification.phone_type})
                </span>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span>Address</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.address_verification_status)}
              {getStatusBadge(verification.address_verification_status)}
            </div>
          </div>

          {/* Homeowner */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Home className="h-3 w-3 text-muted-foreground" />
              <span>Homeowner</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.homeowner_verification_status)}
              {getStatusBadge(verification.homeowner_verification_status)}
            </div>
          </div>

          {/* Intent */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span>Roofing Intent</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.intent_verification_status)}
              {getStatusBadge(verification.intent_verification_status)}
            </div>
          </div>

          {/* Territory */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span>Territory</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.territory_status)}
              {getStatusBadge(verification.territory_status)}
            </div>
          </div>

          {/* Spam */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span>Spam Check</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.spam_verification_status)}
              {getStatusBadge(verification.spam_verification_status)}
            </div>
          </div>

          {/* Duplicate */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Copy className="h-3 w-3 text-muted-foreground" />
              <span>Duplicate</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(verification.duplicate_status)}
              {getStatusBadge(verification.duplicate_status)}
            </div>
          </div>
        </div>

        {/* Quality History Trend */}
        {data.quality_history && data.quality_history.length > 1 && (
          <div>
            <div className="text-xs font-semibold mb-2">Score History</div>
            <div className="flex items-center gap-2 text-xs">
              {data.quality_history.slice(0, 3).map((entry, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center"
                >
                  <div className={`text-xs font-semibold ${getScoreColor(entry.quality_score)}`}>
                    {entry.quality_score}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Verified */}
        {verification.verification_timestamp && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Last verified:{" "}
            {new Date(verification.verification_timestamp).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































