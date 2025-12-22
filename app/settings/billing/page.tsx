// app/(dashboard)/settings/billing/page.tsx
"use client";

import { useEffect, useState } from "react";

type Usage = {
  plan_code: string;
  email_quota: number | null;
  emails_sent: number;
  emails_remaining: number | null;
  percent_used: number | null;
};

function formatPlanName(code: string) {
  switch (code) {
    case "starter": return "Starter";
    case "growth": return "Growth";
    case "domination": return "Domination";
    case "trial":
    default: return "Trial";
  }
}

export default function BillingSettingsPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingPlan, setWorkingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/billing/usage", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setUsage(data);
      } catch (e) {
        console.error("Billing usage load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function startCheckout(plan_code: "starter" | "growth" | "domination") {
    setWorkingPlan(plan_code);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e: any) {
      console.error("Checkout error:", e);
      setMessage(e.message ?? "Unable to start checkout.");
    } finally {
      setWorkingPlan(null);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/create-portal-session", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Portal failed");
      window.location.href = data.url;
    } catch (e: any) {
      console.error("Portal error:", e);
      setMessage(e.message ?? "Unable to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading || !usage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Loading billing info…
      </div>
    );
  }

  const currentPlanName = formatPlanName(usage.plan_code);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">Billing</h1>
        <p className="text-sm text-neutral-400">
          Choose your SmartSend plan and manage your subscription.
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {message}
        </div>
      )}

      {/* Current plan + usage */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Current Plan
            </div>
            <div className="text-lg font-semibold">
              {currentPlanName}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              Emails this period:{" "}
              {usage.email_quota != null
                ? `${usage.emails_sent} / ${usage.email_quota}`
                : `${usage.emails_sent} (unlimited)`}
            </div>
          </div>
          {usage.email_quota != null && (
            <div className="flex flex-col items-end">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${usage.percent_used ?? 0}%` }}
                />
              </div>
              <span className="mt-1 text-[0.7rem] text-neutral-400">
                Usage this period
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openPortal}
          disabled={portalLoading}
          className="mt-2 w-fit rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-100 disabled:opacity-60"
        >
          {portalLoading ? "Opening portal…" : "Manage payment details"}
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3 text-sm">
        {/* Starter */}
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Starter
          </div>
          <div className="text-2xl font-semibold text-neutral-50">$99</div>
          <div className="text-xs text-neutral-400">per month</div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            <li>✓ 1 active campaign</li>
            <li>✓ Up to 500 emails / month</li>
            <li>✓ Basic AI personalization</li>
            <li>✓ Reply tracking + Hot Lead labels</li>
          </ul>
          <button
            type="button"
            onClick={() => startCheckout("starter")}
            disabled={workingPlan !== null}
            className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-60"
          >
            {workingPlan === "starter" ? "Redirecting…" : "Choose Starter"}
          </button>
        </div>

        {/* Growth */}
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/60 bg-neutral-950/80 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Growth
            </div>
            <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-200">
              Most Popular
            </span>
          </div>
          <div className="text-2xl font-semibold text-neutral-50">$199</div>
          <div className="text-xs text-neutral-400">per month</div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            <li>✓ Up to 3 campaigns</li>
            <li>✓ 2,000 emails / month</li>
            <li>✓ Advanced AI + follow-up logic</li>
            <li>✓ Priority support</li>
          </ul>
          <button
            type="button"
            onClick={() => startCheckout("growth")}
            disabled={workingPlan !== null}
            className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-60"
          >
            {workingPlan === "growth" ? "Redirecting…" : "Choose Growth"}
          </button>
        </div>

        {/* Domination */}
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/60 bg-neutral-950/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Domination
          </div>
          <div className="text-2xl font-semibold text-neutral-50">$399</div>
          <div className="text-xs text-neutral-400">per month</div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            <li>✓ Unlimited campaigns</li>
            <li>✓ Unlimited sending*</li>
            <li>✓ Full automation + revenue dashboard</li>
            <li>✓ VIP onboarding & support</li>
          </ul>
          <button
            type="button"
            onClick={() => startCheckout("domination")}
            disabled={workingPlan !== null}
            className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-60"
          >
            {workingPlan === "domination" ? "Redirecting…" : "Choose Domination"}
          </button>
        </div>
      </div>
    </div>
  );
}
