"use client";

import { useState, useEffect } from "react";
import UpgradeModal from "@/components/UpgradeModal";
import type { PlanKey } from "@/lib/planConfig";

export default function StepTargeting({
  targeting,
  setTargeting,
  next,
  back,
}: {
  targeting: any;
  setTargeting: (targeting: any) => void;
  next: () => void;
  back: () => void;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [planTier, setPlanTier] = useState<PlanKey>("starter");
  const [maxDailyLimit, setMaxDailyLimit] = useState<number>(200);

  // Fetch plan limits on mount
  useEffect(() => {
    fetch("/api/plan/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.plan_tier) {
          setPlanTier(data.plan_tier);
          setMaxDailyLimit(data.limits?.max_daily_limit || 200);
        }
      })
      .catch((err) => console.error("Failed to fetch plan limits:", err));
  }, []);

  function update(k: string, v: any) {
    setTargeting({ ...targeting, [k]: v });
  }

  function handleDailyLimitChange(value: number) {
    // Guardrail B: Clamp daily limit to plan max
    if (value > maxDailyLimit) {
      setShowUpgrade(true);
      update("daily_limit", maxDailyLimit);
    } else {
      update("daily_limit", value);
    }
  }

  const days = ["mon", "tue", "wed", "thu", "fri"];

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Targeting & Sending Rules</h1>
        <p className="text-sm text-gray-600 mt-1">
          Configure where and when your campaign will send emails.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">
          City / Service Area
        </label>
        <input
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={targeting.city}
          onChange={(e) => update("city", e.target.value)}
          placeholder="e.g. Austin, TX"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">
          Daily Send Limit (recommended 25–50)
        </label>
        <input
          type="number"
          className="w-32 border rounded-md px-3 py-2 text-sm"
          value={targeting.daily_limit}
          onChange={(e) => handleDailyLimitChange(Number(e.target.value))}
          min="1"
          max={maxDailyLimit}
        />
        <p className="text-xs text-gray-500 mt-1">
          SmartSend recommends 25–50 emails per day for optimal deliverability.
          {maxDailyLimit < 200 && (
            <span className="block mt-1 text-amber-600">
              Your current plan allows up to {maxDailyLimit} emails per day.
            </span>
          )}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-2">Send on Days:</label>
        <div className="flex gap-2 flex-wrap">
          {days.map((d) => (
            <button
              key={d}
              onClick={() =>
                update(
                  "send_days",
                  targeting.send_days.includes(d)
                    ? targeting.send_days.filter((x: string) => x !== d)
                    : [...targeting.send_days, d]
                )
              }
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                targeting.send_days.includes(d)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Mon–Fri recommended for best engagement rates.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={back}
          className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={next}
          disabled={!targeting.city || targeting.daily_limit < 1}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Continue
        </button>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentTier={planTier}
        reason={`Your current plan allows up to ${maxDailyLimit} emails per day. Upgrade to unlock higher sending volume.`}
      />
    </div>
  );
}

