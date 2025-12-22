"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import Link from "next/link";

export function CampaignSendPanel({ onSend }: { onSend: () => void }) {
  const { workspace, loading } = useCurrentWorkspace();

  if (loading || !workspace) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-xl bg-slate-300 text-white text-sm"
      >
        Loading…
      </button>
    );
  }

  const used = workspace.email_used_this_period ?? 0;
  const limit = workspace.email_limit_monthly ?? 0;
  const overLimit = limit > 0 && used >= limit;

  if (overLimit) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-red-600 font-medium">
          You've hit your monthly email limit for the{" "}
          <span className="uppercase">{workspace.plan_key}</span> plan.
        </div>
        <div className="flex gap-2">
          <button
            disabled
            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-500 text-sm cursor-not-allowed"
          >
            Send Campaign
          </button>
          <Link
            href="/billing"
            className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold"
          >
            Upgrade Plan
          </Link>
        </div>
        <div className="text-[11px] text-gray-500">
          Upgrade to Growth or Domination to unlock more sends this month.
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onSend}
      className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold"
    >
      Send Campaign
    </button>
  );
}



























































