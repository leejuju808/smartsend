"use client";

import { useMemo, useState } from "react";

const PRICE_MONTHLY = process.env.NEXT_PUBLIC_PRICE_PRO_MONTHLY!;
const PRICE_ANNUAL = process.env.NEXT_PUBLIC_PRICE_PRO_ANNUAL!;
const DEFAULT_TRIAL = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 0);

export default function BillingPage() {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [promo, setPromo] = useState("");
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL);

  const copy = useMemo(() => {
    return interval === "annual"
      ? { title: "Pro — Annual", subtitle: "Best value (save vs monthly)" }
      : { title: "Pro — Monthly", subtitle: "Flexible, cancel anytime" };
  }, [interval]);

  function upgrade() {
    const params = new URLSearchParams();
    params.set("interval", interval);
    if (trialDays > 0) params.set("trialDays", String(trialDays));
    if (promo.trim()) {
      params.set("promo", promo.trim());
      params.set("promo_type", "coupon");
    }
    window.location.href = `/api/stripe/checkout?${params.toString()}`;
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium">{copy.title}</div>
            <div className="text-sm text-gray-600">{copy.subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <Toggle label="Monthly" active={interval === "monthly"} onClick={() => setInterval("monthly")} />
            <Toggle label="Annual" active={interval === "annual"} onClick={() => setInterval("annual")} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Promo code (optional)</label>
            <input
              value={promo}
              onChange={e => setPromo(e.target.value)}
              placeholder="EARLYBIRD, etc."
              className="mt-1 w-full rounded-xl border p-2"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Trial days</label>
            <input
              type="number"
              min={0}
              max={30}
              value={trialDays}
              onChange={e => setTrialDays(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border p-2"
            />
          </div>
        </div>

        <button onClick={upgrade} className="rounded-2xl bg-black px-4 py-2 text-white">
          Upgrade to Pro
        </button>

        <p className="text-xs text-gray-500">
          You’ll be taken to a secure Stripe Checkout page to complete your subscription.
        </p>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-sm font-medium">Already subscribed?</div>
        <button
          onClick={async () => {
            const res = await fetch("/api/stripe/portal", { method: "POST" });
            const { url } = await res.json();
            window.location.href = url;
          }}
          className="mt-2 rounded-2xl border px-4 py-2"
        >
          Manage billing
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1 text-sm border ${active ? "bg-black text-white" : "bg-white"}`}
    >
      {label}
    </button>
  );
}