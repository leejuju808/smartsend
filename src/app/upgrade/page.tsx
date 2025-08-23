"use client";
import { useEffect, useState } from "react";

export default function UpgradeNowPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // Tiny check: hit your status endpoint
    fetch("/api/subscription/status")
      .then(r => r.json()).then(j => setAuthed(j?.status !== "free" ? true : false))
      .catch(() => setAuthed(false));
  }, []);

  async function goCheckout() {
    setLoading(true);
    const endpoint = authed ? "/api/billing/checkout" : "/api/billing/public-checkout";
    const body = authed ? {} : { email };
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
        {loading ? "Redirecting…" : "Start Free Trial →"}
      </button>
    </div>
  );
} 