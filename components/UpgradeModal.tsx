"use client";

import { PLAN_CONFIG } from "@/lib/planConfig";
import type { PlanKey } from "@/lib/planConfig";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason: string;
  currentTier: PlanKey;
}

export default function UpgradeModal({
  open,
  onClose,
  reason,
  currentTier,
}: UpgradeModalProps) {
  if (!open) return null;

  // Plan limits from plan_limits table (matching migration 21532)
  const limits = {
    starter: { max_campaigns: 1, max_daily_limit: 25, monthly_email_limit: 500 },
    growth: { max_campaigns: 3, max_daily_limit: 75, monthly_email_limit: 2000 },
    domination: {
      max_campaigns: Infinity,
      max_daily_limit: 200,
      monthly_email_limit: 10000,
    },
  };

  const tiers = {
    starter: "Starter",
    growth: "Growth",
    domination: "Domination",
  };

  const upgradeTarget: PlanKey =
    currentTier === "starter" ? "growth" : "domination";

  const upgradeLimits = limits[upgradeTarget];
  const upgradeTierName = tiers[upgradeTarget];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full space-y-4">
        <h2 className="text-lg font-semibold">
          Upgrade to Unlock More Sending Power
        </h2>

        <p className="text-sm text-gray-700">{reason}</p>

        <div className="bg-gray-50 p-3 rounded-lg text-sm">
          <div className="font-semibold">{upgradeTierName} Plan Includes:</div>
          <ul className="mt-1 list-disc ml-4 space-y-1">
            <li>
              Up to{" "}
              {upgradeLimits.max_campaigns === Infinity
                ? "unlimited"
                : upgradeLimits.max_campaigns}{" "}
              campaigns
            </li>
            <li>{upgradeLimits.max_daily_limit} emails per day</li>
            <li>
              {upgradeLimits.monthly_email_limit.toLocaleString()} emails per
              month
            </li>
            <li>Full automation + revenue dashboard</li>
          </ul>
        </div>

        <button
          onClick={() => (window.location.href = "/billing")}
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Upgrade Now
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 text-gray-600 hover:text-gray-900 text-sm transition-colors"
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
