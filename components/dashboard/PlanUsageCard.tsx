// components/dashboard/PlanUsageCard.tsx
"use client";

import Link from "next/link";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { PLAN_CONFIG } from "@/lib/planConfig";
import type { PlanKey } from "@/lib/planConfig";

export function PlanUsageCard() {
  const { workspace } = useCurrentWorkspace();

  if (!workspace) return null;

  const planKey = (workspace.plan_key || "starter") as PlanKey;
  const used = workspace.plan_emails_sent_this_period || 0;

  const planConfig = PLAN_CONFIG[planKey];
  const limit = planConfig.monthlyEmailLimit;
  const progress =
    limit != null && limit > 0 ? Math.min((used / limit) * 100, 100) : null;

  return (
    <div className="border rounded-2xl p-4 bg-white space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Plan Usage</div>
        <div className="text-[11px] text-gray-500 capitalize">
          {planKey} plan
        </div>
      </div>
      {limit == null ? (
        <div className="text-xs text-gray-600">
          You have a high-cap Domination plan. Current month sends:{" "}
          <span className="font-semibold">
            {used.toLocaleString()}
          </span>
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-600">
            Emails this period:{" "}
            <span className="font-semibold">
              {used.toLocaleString()} / {limit.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${
                progress && progress > 80 ? "bg-red-500" : "bg-black"
              }`}
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          {progress && progress > 80 && (
            <div className="text-[10px] text-red-500 mt-1">
              You&apos;re close to your monthly limit. Consider upgrading to
              Growth or Domination for more volume.
            </div>
          )}
        </>
      )}
      <div className="pt-2">
        <Link
          href="/billing"
          className="text-[11px] px-3 py-1.5 rounded-xl bg-black text-white inline-block"
        >
          Upgrade plan
        </Link>
      </div>
    </div>
  );
}

