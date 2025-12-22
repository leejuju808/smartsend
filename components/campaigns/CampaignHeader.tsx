// components/campaigns/CampaignHeader.tsx
"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { PLAN_CONFIG } from "@/lib/planConfig";
import type { PlanKey } from "@/lib/planConfig";

interface CampaignHeaderProps {
  activeCount: number;
}

export function CampaignHeader({ activeCount }: CampaignHeaderProps) {
  const { workspace } = useCurrentWorkspace();
  const planKey = (workspace?.plan_key || "starter") as PlanKey;

  const planMeta: Record<PlanKey, { max: number | null; label: string }> = {
    starter: { max: 1, label: "1 active campaign" },
    growth: { max: 3, label: "3 active campaigns" },
    domination: { max: null, label: "Unlimited campaigns" },
  };

  const planInfo = planMeta[planKey];
  const planConfig = PLAN_CONFIG[planKey];

  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="text-xs text-gray-600">
          {planInfo.max === null
            ? "Your plan includes unlimited campaigns."
            : `You can have up to ${planInfo.max} active campaigns. (${activeCount}/${planInfo.max} used)`}
        </p>
      </div>
      {/* "New campaign" button lives here, will be disabled by API if over limit */}
    </div>
  );
}
