"use client";
import { useState } from "react";

export default function UpgradeModal({ onClose, userId }: { onClose: () => void; userId: string }) {
  const [loading, setLoading] = useState(false);
  const [coupon, setCoupon] = useState("Founders50");

  const goCheckout = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/billing/create-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coupon, userId }),
      });
      const j = await res.json();
      if (j?.url) window.location.href = j.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold">Upgrade to Pro</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <p className="text-gray-600 text-sm">
          Free: 50/day • Pro: 500/day + sequences + priority sending
        </p>

        <div className="mt-4">
          <label className="text-sm text-gray-700">Coupon (optional)</label>
          <input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            className="mt-1 w-full border rounded-xl px-3 py-2"
            placeholder="Enter coupon"
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            disabled={loading}
            onClick={goCheckout}
            className="flex-1 rounded-xl bg-black text-white px-4 py-2"
          >
            {loading ? "Redirecting…" : "Upgrade Now"}
          </button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2">Later</button>
        </div>
      </div>
    </div>
  );
}

