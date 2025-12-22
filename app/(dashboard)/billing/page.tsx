// app/(dashboard)/billing/page.tsx
"use client";

import { useState, useEffect } from "react";

type PlanKey = "starter" | "growth" | "domination";

type Plan = {
  key: PlanKey;
  name: string;
  price: string;
  tagline: string;
  bullets: string[];
};

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$99 / month",
    tagline: "For solo roofers testing SmartSend.",
    bullets: [
      "1 campaign",
      "Up to 500 emails / month",
      "Basic AI personalization",
      "Reply monitoring",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199 / month",
    tagline: "For small teams who want consistent leads.",
    bullets: [
      "3 campaigns",
      "Up to 2,000 emails / month",
      "Advanced AI + follow-up logic",
      "Priority support",
    ],
  },
  {
    key: "domination",
    name: "Domination",
    price: "$399 / month",
    tagline: "For owners who want their calendar full.",
    bullets: [
      "Unlimited campaigns",
      "Full automation",
      "Revenue dashboard",
      "VIP onboarding",
    ],
  },
];

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const statusParam = searchParams.get("status");
      if (statusParam) {
        setStatus(statusParam);
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  async function handleSubscribe(plan: PlanKey) {
    setError(null);
    setLoadingPlan(plan);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start checkout");
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(err.message ?? "Something went wrong");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-50">
            SmartSend Plans
          </h1>
          <p className="text-sm text-neutral-400">
            Choose a plan that fits your roofing business. You can upgrade or
            cancel anytime through Stripe.
          </p>
        </div>
      </header>

      {status === "success" && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          Payment successful. Your SmartSend subscription is now active.
        </div>
      )}

      {status === "cancel" && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-950/60 px-4 py-3 text-sm text-neutral-200">
          Checkout canceled. You can restart your subscription anytime.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-700 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`flex flex-col justify-between rounded-2xl border px-4 py-4 ${
              plan.key === "domination"
                ? "border-amber-600 bg-neutral-950/90"
                : "border-neutral-800 bg-neutral-950/80"
            }`}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-50">
                  {plan.name}
                </h2>
                {plan.key === "domination" && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-400">
                    Best for Owners
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-300">{plan.tagline}</div>
              <div className="mt-2 text-xl font-semibold text-neutral-50">
                {plan.price}
              </div>

              <ul className="mt-3 space-y-1 text-sm text-neutral-300">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-neutral-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => handleSubscribe(plan.key)}
              disabled={loadingPlan !== null}
              className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                plan.key === "domination"
                  ? "bg-neutral-100 text-neutral-900"
                  : "border border-neutral-700 text-neutral-100"
              } disabled:opacity-60`}
            >
              {loadingPlan === plan.key ? "Redirecting…" : "Subscribe"}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
