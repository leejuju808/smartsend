"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (plan: "starter" | "pro") => {
    const priceId =
      plan === "starter"
        ? process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      alert("Price ID not configured");
      return;
    }

    setLoading(plan);

    // store intent
    await fetch("/api/billing/upgrade-intent", {
      method: "POST",
      body: JSON.stringify({ plan, priceId }),
      headers: { "Content-Type": "application/json" },
    });

    // go to login → callback will redirect into checkout
    window.location.href = "/login";
  };

  return (
    <div className="flex flex-col items-center p-8 space-y-6 min-h-screen bg-black text-white">
      <h1 className="text-3xl font-bold">Upgrade SmartSend</h1>
      <p className="text-sm opacity-70">
        Choose your plan to begin powering SmartSend at full scale.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-4">
        {/* Free */}
        <div className="border border-slate-800 rounded-lg p-4 space-y-2">
          <h2 className="text-lg font-semibold">Free</h2>
          <ul className="text-xs opacity-80 space-y-1">
            <li>500 emails/day</li>
            <li>1 seat</li>
            <li>Basic analytics</li>
          </ul>
        </div>

        {/* Starter */}
        <div className="border border-amber-600 rounded-lg p-4 space-y-2">
          <h2 className="text-lg font-semibold">Starter</h2>
          <ul className="text-xs opacity-80 space-y-1">
            <li>2,000 emails/day</li>
            <li>3 seats</li>
            <li>Full dashboards + inbox</li>
          </ul>
          <Button
            className="w-full mt-2"
            disabled={loading === "starter"}
            onClick={() => handleUpgrade("starter")}
          >
            {loading === "starter" ? "Loading…" : "Upgrade to Starter"}
          </Button>
        </div>

        {/* Pro */}
        <div className="border border-emerald-600 rounded-lg p-4 space-y-2">
          <h2 className="text-lg font-semibold">Pro</h2>
          <ul className="text-xs opacity-80 space-y-1">
            <li>10,000 emails/day</li>
            <li>10 seats</li>
            <li>Priority support</li>
          </ul>
          <Button
            className="w-full mt-2"
            disabled={loading === "pro"}
            onClick={() => handleUpgrade("pro")}
          >
            {loading === "pro" ? "Loading…" : "Upgrade to Pro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

