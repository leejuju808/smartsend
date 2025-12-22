"use client";

import { useEffect, useState } from "react";

type PlanKey = "free" | "starter" | "growth" | "domination";

export default function BillingPage() {
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState<PlanKey | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/billing/workspace");
      const json = await res.json();
      setWorkspace(json.workspace);
      setLoading(false);
    }
    load();
  }, []);

  async function upgrade(plan_key: PlanKey) {
    setUpgradingPlan(plan_key);
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_key }),
    });
    const json = await res.json();
    setUpgradingPlan(null);

    if (!res.ok || !json.url) {
      alert(json.error || "Failed to start checkout");
      return;
    }

    window.location.href = json.url;
  }

  if (loading) return <div>Loading…</div>;

  const currentPlan = workspace?.plan_key || "free";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-xs text-gray-600 mt-1">
          Choose the SmartSend plan that matches your roofing business.
        </p>
      </div>

      <div className="border rounded-2xl p-4 bg-white flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">Current plan</div>
          <div className="text-lg font-semibold capitalize">
            {currentPlan}
          </div>
          {workspace?.plan_renews_at && (
            <div className="text-[11px] text-gray-500 mt-1">
              Renews on{" "}
              {new Date(workspace.plan_renews_at).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {workspace?.is_founder && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 uppercase">
              Founders-10 Lifetime Rate
            </span>
          )}
          {workspace?.is_trial_active && workspace?.trial_ends_at && (
            <span className="text-[10px] text-gray-500">
              Trial ends{" "}
              {new Date(workspace.trial_ends_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <PlanCard
          name="Starter"
          price="$99/mo"
          planKey="starter"
          description="Perfect for solo roofers testing SmartSend."
          includes={[
            "1 campaign",
            "Up to 500 emails/month",
            "Basic AI personalization",
            "Reply monitoring",
          ]}
          currentPlan={currentPlan}
          onUpgrade={upgrade}
          upgrading={upgradingPlan === "starter"}
        />

        <PlanCard
          name="Growth"
          price="$199/mo"
          planKey="growth"
          description="For growing teams that want aggressive outreach."
          includes={[
            "3 campaigns",
            "Up to 2,000 emails/month",
            "Advanced AI + follow-ups",
            "Priority support",
          ]}
          currentPlan={currentPlan}
          onUpgrade={upgrade}
          upgrading={upgradingPlan === "growth"}
        />

        <PlanCard
          name="Domination"
          price="$399/mo"
          planKey="domination"
          description="Unlimited campaigns and full automation."
          includes={[
            "Unlimited campaigns",
            "Higher volume (per fair use)",
            "Revenue dashboard & automation",
            "VIP onboarding",
          ]}
          currentPlan={currentPlan}
          onUpgrade={upgrade}
          upgrading={upgradingPlan === "domination"}
        />
      </div>
    </div>
  );
}

type PlanCardProps = {
  name: string;
  price: string;
  planKey: PlanKey;
  description: string;
  includes: string[];
  currentPlan: PlanKey;
  onUpgrade: (plan: PlanKey) => void;
  upgrading: boolean;
};

function PlanCard({
  name,
  price,
  planKey,
  description,
  includes,
  currentPlan,
  onUpgrade,
  upgrading,
}: PlanCardProps) {
  const isCurrent = currentPlan === planKey;

  return (
    <div className="border rounded-2xl p-4 bg-white flex flex-col justify-between">
      <div>
        <div className="text-xs font-semibold">{name}</div>
        <div className="text-lg font-semibold mt-1">{price}</div>
        <div className="text-[11px] text-gray-600 mt-1">{description}</div>
        <ul className="mt-3 space-y-1 text-[11px] text-gray-700">
          {includes.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        {isCurrent ? (
          <button
            disabled
            className="w-full text-[11px] px-3 py-2 rounded-xl border bg-slate-100 text-gray-500"
          >
            Current plan
          </button>
        ) : (
          <button
            onClick={() => onUpgrade(planKey)}
            disabled={upgrading}
            className="w-full text-[11px] px-3 py-2 rounded-xl bg-black text-white"
          >
            {upgrading ? "Redirecting…" : `Upgrade to ${name}`}
          </button>
        )}
      </div>
    </div>
  );
}
