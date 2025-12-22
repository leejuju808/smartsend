"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { useBillingAccount } from "@/hooks/useBillingAccount";

interface CampaignStartProps {
  campaignId: string;
  providerAccountId: string;
  leads: Array<{ id: string; email: string; name?: string; first_name?: string }>;
  template: { subject: string; html: string };
}

export function CampaignStart({ campaignId, providerAccountId, leads, template }: CampaignStartProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; count?: number } | null>(null);
  const { isActive, loading: billingLoading } = useBillingAccount();

  async function start() {
    setLoading(true);
    setResult(null);

    try {
      const r = await fetch(`/api/smartsend/${campaignId}/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads, template, providerAccountId })
      });

      const j = await r.json();
      setResult(j);

      // Mark onboarding step complete if campaign started successfully
      if (j.ok) {
        try {
          await fetch('/api/onboarding/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'send_first' }),
          })
        } catch (e) {
          // Silently fail - onboarding is not critical
        }
      }

      // Kick the worker (optional if using cron/scheduler)
      fetch('/api/smartsend/worker', { method: 'POST' }).catch(() => {});
    } catch (e) {
      setResult({ error: 'Failed to start campaign' });
      console.error('Error starting campaign:', e);
    } finally {
      setLoading(false);
    }
  }

  const showBillingBlock = !billingLoading && isActive === false;

  return (
    <div className="flex flex-col gap-4">
      {showBillingBlock ? (
        <Alert className="border-red-300 bg-red-50 text-red-800">
          <AlertTitle>Upgrade to send emails</AlertTitle>
          <AlertDescription>
            Your subscription is inactive. Visit <Link href="/settings/billing" className="underline">Billing</Link> to upgrade.
          </AlertDescription>
        </Alert>
      ) : (
        <button
          onClick={start}
          className="px-6 py-3 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          disabled={loading || leads.length === 0 || billingLoading}
        >
          {loading ? "Starting Campaign..." : `Start Campaign (${leads.length} emails)`}
        </button>
      )}

      {result && (
        <div className={`p-4 rounded-lg ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {result.ok ? (
            <p>✓ {result.count} emails queued successfully</p>
          ) : (
            <p>✗ {result.error || "Failed to start campaign"}</p>
          )}
        </div>
      )}
    </div>
  );
}
