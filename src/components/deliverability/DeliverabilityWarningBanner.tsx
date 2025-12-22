"use client";

import { useEffect, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface WarningBannerProps {
  campaignId: string;
  teamId?: string;
}

interface Warnings {
  bounceRate: boolean;
  complaintRate: boolean;
  domainHealth: boolean;
  bounceMsg?: string;
  complaintMsg?: string;
  domainMsg?: string;
}

export function DeliverabilityWarningBanner({ campaignId, teamId }: WarningBannerProps) {
  const [warnings, setWarnings] = useState<Warnings>({
    bounceRate: false,
    complaintRate: false,
    domainHealth: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!teamId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch deliverability data for last 7 days
        const resp = await fetch(`/api/deliverability/warnings?teamId=${teamId}`);
        const data = await resp.json();

        setWarnings({
          bounceRate: data.bounceRate >= 3,
          complaintRate: data.complaintRate >= 0.1,
          domainHealth: data.domainHealth < 70,
          bounceMsg: data.bounceMsg,
          complaintMsg: data.complaintMsg,
          domainMsg: data.domainMsg,
        });
      } catch (error) {
        console.error("Failed to load deliverability warnings:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [teamId]);

  if (loading || (!warnings.bounceRate && !warnings.complaintRate && !warnings.domainHealth)) {
    return null;
  }

  return (
    <Alert className="border-orange-200 bg-orange-50">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-800">Deliverability Warnings</AlertTitle>
      <AlertDescription className="text-sm text-orange-700 space-y-2">
        {warnings.bounceRate && (
          <div>⚠️ <strong>High bounce rate</strong> — {warnings.bounceMsg || "≥3% over last 3 days. Pause & verify leads."}</div>
        )}
        {warnings.complaintRate && (
          <div>⚠️ <strong>Complaints detected</strong> — {warnings.complaintMsg || "≥0.1% over last 7 days. Lower pacing and review copy."}</div>
        )}
        {warnings.domainHealth && (
          <div>⚠️ <strong>Domain health</strong> — {warnings.domainMsg || "Score <70. Fix SPF/DKIM/DMARC for better inboxing."}</div>
        )}
        <div className="pt-2">
          <a href="/settings/deliverability" className="text-orange-600 underline">View Deliverability Settings</a>
        </div>
      </AlertDescription>
    </Alert>
  );
}

