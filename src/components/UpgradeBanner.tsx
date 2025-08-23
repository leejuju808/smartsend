"use client";
import { useEffect, useState } from "react";

export default function UpgradeBanner() {
  const [variant, setVariant] = useState<string | null>(null);
  const [expId, setExpId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/experiments/upgrade_banner")
      .then((r) => r.json())
      .then((j) => {
        if (j.variant) setVariant(j.variant);
        if (j.id) setExpId(j.id);
        // log view
        if (j.variant && j.id) {
          fetch("/api/experiments/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              experiment_id: j.id,
              variant: j.variant,
              event: "viewed_banner",
            }),
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!variant) return null;

  const copy = {
    A: {
      headline: "🚀 Upgrade to Pro",
      sub: "Unlock full automation today.",
      cta: "Upgrade Now",
    },
    B: {
      headline: "💡 Don't leave meetings on the table",
      sub: "Pro users 2× their booked calls.",
      cta: "Start Pro →",
    },
  }[variant as 'A' | 'B'];

  async function click() {
    if (expId) {
      await fetch("/api/experiments/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: expId,
          variant,
          event: "clicked_cta",
        }),
      });
    }
    window.location.href = "/dashboard/billing";
  }

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 className="font-semibold text-yellow-900">{copy.headline}</h2>
        <p className="text-sm text-yellow-800">{copy.sub}</p>
      </div>
      <button
        onClick={click}
        className="px-3 py-2 rounded bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition-colors"
      >
        {copy.cta}
      </button>
    </div>
  );
} 