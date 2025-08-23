"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function UpgradeNowPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const searchParams = useSearchParams();
  const planDefault = (searchParams.get("plan") === "annual") ? "annual" : "monthly";
  const [plan, setPlan] = useState<"monthly"|"annual">(planDefault);

  useEffect(() => {
    // Tiny check: hit your status endpoint
    fetch("/api/subscription/status")
      .then(r => r.json()).then(j => setAuthed(j?.status !== "free" ? true : false))
      .catch(() => setAuthed(false));
  }, []);

  async function goCheckout() {
    setLoading(true);
    const endpoint = authed ? "/api/billing/checkout" : "/api/billing/public-checkout";
    const body = authed ? { plan } : { email, plan };
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
    else {
      alert(j.error || "Checkout failed");
      setLoading(false);
    }
  }

  const disabled = loading || (authed === false && !email);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-4xl font-bold mb-4">Upgrade to Pro</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Unlimited contacts, AI replies, and meeting automations.
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

      {authed === false && (
        <div className="w-full max-w-sm mb-4">
          <input
            type="email"
            placeholder="email@company.com"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={e=>setEmail(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            We'll send a magic link so you can log in after checkout.
          </p>
        </div>
      )}

      <button
        onClick={goCheckout}
        disabled={disabled}
        className="px-6 py-3 rounded bg-black text-white font-medium disabled:opacity-50"
      >
        {loading ? "Redirecting…" : (plan === "annual" ? "Start Annual Free Trial →" : "Start Free Trial →")}
      </button>
    </div>
  );
} 