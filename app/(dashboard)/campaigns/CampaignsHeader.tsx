// app/(dashboard)/campaigns/CampaignsHeader.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PlanKey = "starter" | "growth" | "domination";

type UsageResponse = {
  plan: PlanKey | null;
  subscription_status: string | null;
  campaigns_used: number;
  campaigns_limit: number | null;
  emails_sent_this_month: number;
  email_limit: number | null;
};

export function CampaignsHeader() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/billing/usage", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) return;

      const json: UsageResponse = await res.json();
      setUsage(json);
    }

    load();
  }, []);

  const atLimit =
    usage &&
    usage.campaigns_limit !== null &&
    usage.campaigns_used >= usage.campaigns_limit;

  return (
    <header className="mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-neutral-50">Campaigns</h1>
        <p className="text-sm text-neutral-400">
          Manage your SmartSend outreach campaigns.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Link
          href={atLimit ? "/billing" : "/campaigns/new"}
          className={`rounded-xl px-3 py-2 font-semibold ${
            atLimit
              ? "border border-amber-600 text-amber-300"
              : "bg-neutral-100 text-neutral-900"
          }`}
        >
          {atLimit ? "Upgrade to add more" : "New Campaign"}
        </Link>
      </div>
    </header>
  );
}

























































