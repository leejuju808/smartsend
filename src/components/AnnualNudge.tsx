"use client";
import { useEffect, useState } from "react";

export default function AnnualNudge() {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    fetch("/api/subscription/status")
      .then(r => r.json())
      .then(j => {
        if (j.status === "pro" && j.trial_end) {
          const days = Math.ceil((new Date(j.trial_end).getTime() - Date.now()) / (1000*60*60*24));
          if (days <= 3 && days >= 0) setShow(true);
        }
      }).catch(() => {});
  }, []);

  if (!show) return null;

  async function goAnnual() {
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "annual" })
    });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="text-blue-900 text-sm">
        Lock in <b>2 months free</b> with annual before your trial ends.
      </div>
      <button 
        onClick={goAnnual} 
        className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
      >
        Switch to Annual →
      </button>
    </div>
  );
} 