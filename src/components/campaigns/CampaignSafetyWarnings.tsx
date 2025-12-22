"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Shield, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/badge";
import { checkTemplateRisk } from "@/lib/sendQueue";
import { checkMailboxSafety } from "@/lib/deliverability/mailboxSafety";
import { getEffectiveDailyLimit } from "@/lib/deliverability/warmupCurve";

interface CampaignSafetyCheckProps {
  userId: string;
  subject: string;
  body: string;
  mailboxId?: string;
}

interface SafetyCheckResult {
  mailboxWarmupOk: boolean;
  dailyLimitOk: boolean;
  templateRisk: {
    score: number;
    isHighRisk: boolean;
    highRiskWords: string[];
  };
  estimatedInboxPlacement: number;
  warnings: string[];
}

export default function CampaignSafetyWarnings({
  userId,
  subject,
  body,
  mailboxId,
}: CampaignSafetyCheckProps) {
  const [checkResult, setCheckResult] = useState<SafetyCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runSafetyCheck();
  }, [userId, subject, body, mailboxId]);

  const runSafetyCheck = async () => {
    try {
      setLoading(true);

      // 1. Check template risk
      const templateRisk = checkTemplateRisk(subject, body);

      // 2. Check mailbox safety (if mailboxId provided)
      let mailboxWarmupOk = true;
      let dailyLimitOk = true;
      const warnings: string[] = [];

      if (mailboxId) {
        const safety = await checkMailboxSafety(mailboxId);
        mailboxWarmupOk = safety.canSend;
        dailyLimitOk = safety.canSend;

        if (!safety.canSend) {
          warnings.push(`Mailbox limit reached: ${safety.reason}`);
        }
      }

      // 3. Calculate estimated inbox placement (simplified)
      let estimatedInboxPlacement = 95;
      if (templateRisk.isHighRisk) {
        estimatedInboxPlacement -= 20;
      }
      if (templateRisk.score > 40) {
        estimatedInboxPlacement -= 10;
      }
      if (!mailboxWarmupOk) {
        estimatedInboxPlacement -= 5;
      }
      estimatedInboxPlacement = Math.max(0, Math.min(100, estimatedInboxPlacement));

      // Add template warnings
      if (templateRisk.isHighRisk) {
        warnings.push(
          `Template contains ${templateRisk.highRiskWords.length} high-risk deliverability words`
        );
      }

      setCheckResult({
        mailboxWarmupOk,
        dailyLimitOk,
        templateRisk,
        estimatedInboxPlacement,
        warnings,
      });
    } catch (error) {
      console.error("Error running safety check:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Deliverability Check</AlertTitle>
        <AlertDescription>Checking campaign safety...</AlertDescription>
      </Alert>
    );
  }

  if (!checkResult) {
    return null;
  }

  const allChecksPassed =
    checkResult.mailboxWarmupOk &&
    checkResult.dailyLimitOk &&
    !checkResult.templateRisk.isHighRisk;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold">Deliverability Check</h3>
      </div>

      <div className="space-y-2">
        {/* Mailbox Warmup */}
        <div className="flex items-center gap-2 text-sm">
          {checkResult.mailboxWarmupOk ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Mailbox warmup OK</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Mailbox warmup issue</span>
            </>
          )}
        </div>

        {/* Daily Limit */}
        <div className="flex items-center gap-2 text-sm">
          {checkResult.dailyLimitOk ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Daily limit OK</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Daily limit reached</span>
            </>
          )}
        </div>

        {/* Template Risk */}
        {checkResult.templateRisk.isHighRisk ? (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-amber-600">
              Template contains {checkResult.templateRisk.highRiskWords.length} high-risk words
            </span>
          </div>
        ) : checkResult.templateRisk.score > 30 ? (
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-yellow-600">
              Template risk score: {checkResult.templateRisk.score}/100
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Template safety OK</span>
          </div>
        )}

        {/* Estimated Inbox Placement */}
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>
            Estimated inbox placement:{" "}
            <Badge
              variant={
                checkResult.estimatedInboxPlacement >= 90
                  ? "default"
                  : checkResult.estimatedInboxPlacement >= 70
                  ? "secondary"
                  : "destructive"
              }
            >
              {checkResult.estimatedInboxPlacement}%
            </Badge>
          </span>
        </div>
      </div>

      {/* Warnings Alert */}
      {checkResult.warnings.length > 0 && (
        <Alert className={allChecksPassed ? "border-yellow-200 bg-yellow-50" : "border-red-200 bg-red-50"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Safety Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {checkResult.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Success Message */}
      {allChecksPassed && checkResult.warnings.length === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>All Checks Passed</AlertTitle>
          <AlertDescription>
            Your campaign is ready to send with optimal deliverability settings.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

