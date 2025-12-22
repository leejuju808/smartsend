// app/(dashboard)/settings/billing/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PLANS } from "@/lib/billing/plans";

type SubscriptionState = {
  plan: "starter" | "growth" | "domination";
  status: string;
};

export default function BillingSettingsPage() {
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/billing/me", { cache: "no-store" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setSub(data);
      } catch (e) {
        console.error("Billing load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function startCheckout(plan: "starter" | "growth" | "domination") {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to start checkout");
      }
      window.location.href = data.url;
    } catch (e: any) {
      setStatus(e.message ?? "Failed to start checkout");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to open billing portal");
      }
      window.location.href = data.url;
    } catch (e: any) {
      setStatus(e.message ?? "Failed to open billing portal");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Loading billing…
      </div>
    );
  }

  const currentPlanId = sub?.plan ?? "starter";
  const currentPlan = PLANS[currentPlanId];

  return (
    <div className="flex h-full flex-col gap-6 p-6 text-xs text-neutral-100">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">Billing</h1>
        <p className="text-sm text-neutral-400">
          Manage your SmartSend plan and subscription.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
        <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
          Current plan
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-lg font-semibold text-neutral-50">
            {currentPlan.name}
          </div>
          <div className="text-sm text-neutral-400">
            ${currentPlan.price}/month
          </div>
        </div>
        <div className="text-[0.75rem] text-neutral-400">
          {currentPlan.maxCampaigns
            ? `${currentPlan.maxCampaigns} campaigns • `
            : "Unlimited campaigns • "}
          {currentPlan.monthlyEmailLimit
            ? `${currentPlan.monthlyEmailLimit.toLocaleString()} emails/month`
            : "High-volume sending"}
        </div>
        {sub && (
          <div className="text-[0.7rem] text-neutral-500">
            Status: <span className="text-neutral-200">{sub.status}</span>
          </div>
        )}
        <button
          onClick={openPortal}
          disabled={busy}
          className="mt-2 inline-flex rounded-xl border border-neutral-700 px-3 py-2 text-[0.75rem] font-semibold text-neutral-100 disabled:opacity-50"
        >
          Manage Billing & Invoices
        </button>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {(["starter", "growth", "domination"] as const).map((id) => {
          const p = PLANS[id];
          const isCurrent = id === currentPlanId;
          return (
            <div
              key={id}
              className={`flex flex-col rounded-2xl border p-4 ${
                isCurrent
                  ? "border-emerald-500/70 bg-emerald-900/20"
                  : "border-neutral-800 bg-neutral-950/80"
              }`}
            >
              <div className="text-sm font-semibold text-neutral-100">
                {p.name}
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-50">
                ${p.price}
                <span className="text-xs text-neutral-400">/month</span>
              </div>
              <div className="mt-2 text-[0.75rem] text-neutral-400">
                {p.maxCampaigns
                  ? `${p.maxCampaigns} campaigns`
                  : "Unlimited campaigns"}
                <br />
                {p.monthlyEmailLimit
                  ? `${p.monthlyEmailLimit.toLocaleString()} emails/month`
                  : "High-volume sending"}
              </div>
              <button
                disabled={busy || isCurrent}
                onClick={() => startCheckout(id)}
                className={`mt-3 rounded-xl px-3 py-2 text-[0.75rem] font-semibold ${
                  isCurrent
                    ? "bg-neutral-800 text-neutral-300 cursor-default"
                    : "bg-neutral-100 text-neutral-900"
                } disabled:opacity-50`}
              >
                {isCurrent ? "Current Plan" : "Choose Plan"}
              </button>
            </div>
          );
        })}
      </section>

      {status && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-3 text-xs text-red-300">
          {status}
        </div>
      )}
    </div>
  );
}

























































