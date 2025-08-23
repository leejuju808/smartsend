"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Steps = {
  import_contacts?: boolean;
  send_campaign?: boolean;
  upgrade?: boolean;
};

export default function DemoTourBanner() {
  const [steps, setSteps] = useState<Steps>({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = () => {
    fetch("/api/onboarding/status")
      .then(r => r.json())
      .then(j => { setSteps(j.steps || {}); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const markStepComplete = async (step: keyof Steps) => {
    try {
      await fetch("/api/onboarding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step })
      });
      // Refresh the status to show the updated progress
      fetchStatus();
    } catch (error) {
      console.error("Error marking step complete:", error);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const { total, completed, pct } = useMemo(() => {
    const keys: (keyof Steps)[] = ["import_contacts", "send_campaign", "upgrade"];
    const total = keys.length;
    const completed = keys.reduce((n, k) => n + (steps[k] ? 1 : 0), 0);
    const pct = Math.round((completed / total) * 100);
    return { total, completed, pct };
  }, [steps]);

  if (loading) return null;
  const allDone = steps.import_contacts && steps.send_campaign && steps.upgrade;
  if (allDone) return null;

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-yellow-900">👋 Welcome to SmartSendAI</h2>
          <p className="text-sm text-yellow-800">
            Follow these quick steps to see SmartSendAI in action:
          </p>
        </div>

        <div className="flex gap-3">
          {!steps.import_contacts && (
            <Link
              href="/dashboard/contacts/import"
              className="px-3 py-2 rounded bg-yellow-600 text-white text-sm font-medium"
              onClick={() => markStepComplete("import_contacts")}
            >
              1. Download CSV
            </Link>
          )}
          {!steps.send_campaign && (
            <Link
              href="/dashboard/campaigns/new"
              className="px-3 py-2 rounded bg-yellow-600 text-white text-sm font-medium"
              onClick={() => markStepComplete("send_campaign")}
            >
              2. Send Campaign
            </Link>
          )}
          {!steps.upgrade && (
            <Link
              href="/dashboard/billing"
              className="px-3 py-2 rounded bg-yellow-600 text-white text-sm font-medium"
              onClick={() => markStepComplete("upgrade")}
            >
              3. Upgrade
            </Link>
          )}
        </div>
      </div>

      {/* Progress bar row */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-yellow-900 mb-1">
          <span>Progress</span>
          <span>{completed}/{total} complete</span>
        </div>
        <div className="h-2 w-full bg-yellow-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-600 transition-all duration-500"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </div>
  );
} 