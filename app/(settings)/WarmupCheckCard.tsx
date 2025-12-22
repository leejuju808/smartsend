"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { WarmupCheckResult, RiskReason, Recommendation } from "@/lib/warmup/risk-calculator";

type ConnectedAccount = {
  id: string;
  email: string;
  email_address?: string;
  provider: "gmail" | "outlook";
  domain?: string;
  last_risk_score?: number;
  last_risk_reason?: any;
  last_risk_checked_at?: string;
  suggested_daily_limit?: number;
};

interface WarmupCheckCardProps {
  account: ConnectedAccount;
}

export function WarmupCheckCard({ account }: WarmupCheckCardProps) {
  const [loading, setLoading] = React.useState(false);
  const [checkResult, setCheckResult] = React.useState<WarmupCheckResult | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);

  const emailAddress = account.email_address || account.email;
  const domain = account.domain || emailAddress.split("@")[1] || "unknown";
  const riskScore = account.last_risk_score ?? checkResult?.score;
  const lastChecked = account.last_risk_checked_at || checkResult?.checked_at;

  async function runCheck() {
    try {
      setLoading(true);
      const response = await fetch(`/api/sending/${account.id}/warmup-check`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to run check");
      }

      const result: WarmupCheckResult = await response.json();
      setCheckResult(result);
      toast.success("Warmup check completed");
      setShowDetails(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to run warmup check");
    } finally {
      setLoading(false);
    }
  }

  const riskLevel = checkResult?.risk_level || 
    (riskScore !== undefined 
      ? riskScore < 40 ? "high" : riskScore < 70 ? "medium" : "low"
      : null);

  const RiskBadge = () => {
    if (!riskLevel) return null;
    
    const variants = {
      low: { variant: "default" as const, icon: CheckCircle2, label: "Good", color: "text-green-600" },
      medium: { variant: "secondary" as const, icon: AlertTriangle, label: "Medium", color: "text-yellow-600" },
      high: { variant: "destructive" as const, icon: XCircle, label: "Dangerous", color: "text-red-600" },
    };

    const config = variants[riskLevel];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Deliverability Check</CardTitle>
            <CardDescription className="text-xs mt-1">
              Email: {emailAddress}
              <br />
              Domain: {domain}
            </CardDescription>
          </div>
          <RiskBadge />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {riskScore !== undefined ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Spam Risk Score</span>
              <span className={`text-lg font-bold ${
                riskScore < 40 ? "text-red-600" : 
                riskScore < 70 ? "text-yellow-600" : 
                "text-green-600"
              }`}>
                {riskScore}
              </span>
            </div>
            {lastChecked && (
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(lastChecked).toLocaleString()}
              </p>
            )}
            {account.suggested_daily_limit && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Suggested daily limit:</p>
                <p className="text-sm font-medium">{account.suggested_daily_limit} emails/day</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No risk check performed yet. Click "Run Check Now" to analyze your sending setup.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={runCheck}
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              "Run Check Now"
            )}
          </Button>
          {checkResult && (
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  View Details
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Deliverability Check Details</DialogTitle>
                  <DialogDescription>
                    Detailed analysis of your email sending setup
                  </DialogDescription>
                </DialogHeader>
                <WarmupCheckDetails result={checkResult} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WarmupCheckDetails({ result }: { result: WarmupCheckResult }) {
  return (
    <div className="space-y-6">
      {/* Score Summary */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Risk Score: {result.score}/100</h3>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full ${
              result.risk_level === "high"
                ? "bg-red-600"
                : result.risk_level === "medium"
                ? "bg-yellow-600"
                : "bg-green-600"
            }`}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Risk Level: <span className="font-medium capitalize">{result.risk_level}</span>
        </p>
      </div>

      {/* DNS Status */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">DNS Records</h3>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span>SPF</span>
            {result.dns_status.has_spf ? (
              <Badge variant="default" className="text-xs">✓ Present</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">✗ Missing</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span>DKIM</span>
            {result.dns_status.has_dkim ? (
              <Badge variant="default" className="text-xs">✓ Present</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">✗ Missing</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span>DMARC</span>
            {result.dns_status.has_dmarc ? (
              <Badge variant="default" className="text-xs">✓ Present</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">✗ Missing</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Volume Stats */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Sending Volume</h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Last 24h</p>
            <p className="font-medium">{result.volume_stats.last_24h}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Last 7 days</p>
            <p className="font-medium">{result.volume_stats.last_7d}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Last 30 days</p>
            <p className="font-medium">{result.volume_stats.last_30d}</p>
          </div>
        </div>
      </div>

      {/* Risk Reasons */}
      {result.reasons.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Issues Found</h3>
          <div className="space-y-2">
            {result.reasons.map((reason: RiskReason, idx: number) => (
              <Alert
                key={idx}
                variant={reason.severity === "high" ? "destructive" : "default"}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">{reason.label}</AlertTitle>
                <AlertDescription className="text-xs">
                  Penalty: -{reason.penalty} points ({reason.severity} severity)
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Recommendations</h3>
          <div className="space-y-3">
            {result.recommendations.map((rec: Recommendation, idx: number) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{rec.label}</h4>
                      <Badge
                        variant={
                          rec.priority === "high"
                            ? "destructive"
                            : rec.priority === "medium"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {rec.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rec.description}
                    </p>
                    {rec.warmup_schedule && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs">
                        <p className="font-medium mb-1">Warmup Schedule:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>Day 1-2: {rec.warmup_schedule.day_1_2}/day</li>
                          <li>Day 3-4: {rec.warmup_schedule.day_3_4}/day</li>
                          <li>Day 5-7: {rec.warmup_schedule.day_5_7}/day</li>
                          <li>Day 8-14: {rec.warmup_schedule.day_8_14}/day</li>
                          <li>Day 15+: {rec.warmup_schedule.day_15_plus}/day</li>
                        </ul>
                      </div>
                    )}
                  </div>
                  {rec.link && (
                    <a
                      href={rec.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Daily Limit */}
      <Alert>
        <AlertTitle className="text-sm">Suggested Daily Limit</AlertTitle>
        <AlertDescription className="text-xs">
          Based on your current risk score, we recommend sending no more than{" "}
          <span className="font-bold">{result.suggested_daily_limit} emails per day</span>{" "}
          until you address the issues above.
        </AlertDescription>
      </Alert>
    </div>
  );
}

