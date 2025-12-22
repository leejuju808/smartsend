"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function UpgradeNowPage() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const planDefault = (searchParams.get("plan") === "annual") ? "annual" : "monthly";
  const [plan, setPlan] = useState<"monthly"|"annual">(planDefault);

  async function goCheckout() {
    setLoading(true);
    // Use env vars for price IDs
    const priceId = plan === "annual" 
      ? process.env.NEXT_PUBLIC_PRICE_PRO_ANNUAL_ID 
      : process.env.NEXT_PUBLIC_PRICE_PRO_ID;
    
    if (!priceId) {
      alert("Pricing not configured");
      setLoading(false);
      return;
    }

    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
    else {
      alert(j.error || "Checkout failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-4xl font-bold mb-4">Upgrade to Pro</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Higher limits on contacts, AI replies, and meeting automations.
        Start your 7-day free trial, then $49/mo.
      </p>

      {/* Monthly/Annual Toggle */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setPlan("monthly")}
          className={`px-3 py-1 rounded border transition-colors ${
            plan === "monthly" ? "bg-black text-white" : "hover:bg-gray-50"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setPlan("annual")}
          className={`px-3 py-1 rounded border transition-colors ${
            plan === "annual" ? "bg-black text-white" : "hover:bg-gray-50"
          }`}
        >
          Annual <span className="ml-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">2 months free</span>
        </button>
      </div>

      <p className="text-gray-600 mb-6 text-center text-sm">
        {plan === "annual"
          ? "Pay once, save ~17%. Best for teams who are all-in."
          : "Pay monthly. Cancel anytime."}
      </p>

      <button
        onClick={goCheckout}
        disabled={loading}
        className="px-6 py-3 rounded bg-black text-white font-medium disabled:opacity-50"
      >
        {loading ? "Redirecting…" : (plan === "annual" ? "Start Annual Free Trial →" : "Start Free Trial →")}
      </button>
    </div>
  );
} 