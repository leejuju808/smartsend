"use client";

import { useState, useEffect } from "react";
import UpgradeModal from "@/components/UpgradeModal";
import type { PlanKey } from "@/lib/planConfig";

export function PlanUsageBanner() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [planTier, setPlanTier] = useState<PlanKey>("starter");
  const [usagePct, setUsagePct] = useState<number>(0);
  const [hasPlanFailures, setHasPlanFailures] = useState(false);

  useEffect(() => {
    // Fetch plan limits and usage
    fetch("/api/plan/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.plan_tier) {
          setPlanTier(data.plan_tier);
          setUsagePct(data.usage_percent || 0);
        }
      })
      .catch((err) => console.error("Failed to fetch plan limits:", err));

    // Check for plan limit failures in send_queue
    fetch("/api/plan/check-failures")
      .then((res) => res.json())
      .then((data) => {
        setHasPlanFailures(data.hasFailures || false);
      })
      .catch((err) => console.error("Failed to check plan failures:", err));
  }, []);

  // Don't render anything if no warnings needed
  if (usagePct < 80 && !hasPlanFailures) {
    return null;
  }

  return (
    <>
      {/* Guardrail C: Monthly limit approaching banner (80%+) */}
      {usagePct >= 80 && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">
          You're at {Math.round(usagePct)}% of your monthly email limit.
          <button
            className="ml-2 text-blue-600 underline hover:text-blue-800"
            onClick={() => setShowUpgrade(true)}
          >
            Upgrade now →
          </button>
        </div>
      )}

      {/* Guardrail D: Worker-level hard limit warning */}
      {hasPlanFailures && (
        <div className="p-2 bg-red-50 border border-red-300 rounded text-xs">
          Some emails were paused due to plan limits.
          <button
            className="ml-1 text-blue-600 underline hover:text-blue-800"
            onClick={() => setShowUpgrade(true)}
          >
            Upgrade →
          </button>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentTier={planTier}
        reason={
          hasPlanFailures
            ? `Some emails were paused because you've reached your plan limits. Upgrade to continue sending.`
            : `You're approaching your monthly email limit. Upgrade to unlock higher sending volume.`
        }
      />
    </>
  );
}
