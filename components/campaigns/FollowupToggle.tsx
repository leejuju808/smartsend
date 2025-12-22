"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import { useUpgradeGate } from "@/hooks/useUpgradeGate";
import { UpgradeModal } from "@/components/UpgradeModal";

export function FollowupToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
}) {
  const { workspace, loading } = useCurrentWorkspace();
  const { upgradeReason, requireUpgrade, close } = useUpgradeGate();

  if (loading || !workspace) return null;

  const features = getFeatures(workspace.plan_key as any);
  const locked = !features.autoFollowups;

  if (locked) {
    return (
      <>
        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-xs font-semibold mb-1">
            Auto Follow-ups (Growth & Domination)
          </div>
          <div className="text-[11px] text-gray-600 mb-2">
            SmartSend can automatically send follow-up emails when prospects
            don't reply — available on Growth and Domination plans.
          </div>
          <button
            onClick={() => requireUpgrade("feature_locked")}
            className="inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
          >
            Upgrade to unlock
          </button>
        </div>
        
        {upgradeReason && (
          <UpgradeModal feature={upgradeReason} onClose={close} />
        )}
      </>
    );
  }

  return (
    <div className="flex items-center justify-between border rounded-xl p-3">
      <div>
        <div className="text-xs font-semibold">Auto Follow-ups</div>
        <div className="text-[11px] text-gray-600">
          Automatically follow up with homeowners who don't respond.
        </div>
      </div>
      <label className="inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="hidden"
        />
        <span
          className={`w-9 h-5 flex items-center rounded-full p-0.5 ${
            enabled ? "bg-black" : "bg-slate-300"
          }`}
        >
          <span
            className={`w-4 h-4 bg-white rounded-full transform transition ${
              enabled ? "translate-x-4" : ""
            }`}
          />
        </span>
      </label>
    </div>
  );
}

