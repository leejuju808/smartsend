"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import Link from "next/link";

export function CampaignListHeader({
  currentCampaignCount,
  onCreate,
}: {
  currentCampaignCount: number;
  onCreate: () => void;
}) {
  const { workspace, loading } = useCurrentWorkspace();

  if (loading || !workspace) return null;

  const features = getFeatures(workspace.plan_key as any);
  const overCampaignLimit = currentCampaignCount >= features.maxCampaigns;

  return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-lg font-semibold">Campaigns</h1>
      <div className="flex items-center gap-2">
        {overCampaignLimit && (
          <span className="text-[11px] text-gray-500">
            You've reached the campaign limit for your plan.
          </span>
        )}
        <button
          onClick={() => {
            if (overCampaignLimit) {
              window.location.href = "/billing";
              return;
            }
            onCreate();
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
            overCampaignLimit
              ? "bg-slate-100 text-slate-500"
              : "bg-black text-white border-black"
          }`}
        >
          {overCampaignLimit ? "Upgrade to add more" : "New Campaign"}
        </button>
      </div>
    </div>
  );
}



























































