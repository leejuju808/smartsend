"use client";
import { useEffect, useState } from "react";

export default function CreditMeter() {
  const [bal, setBal] = useState<number|null>(null);
  const [busy, setBusy] = useState<string|null>(null);

  useEffect(() => {
    fetch("/api/me").then(r=>r.json()).then(j=>setBal(j.team_credit_balance ?? 0)).catch(()=>{});
  }, []);

  async function buy(pack: "200"|"1000"|"5000") {
    setBusy(pack);
    try {
      const r = await fetch("/api/billing/topup", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ pack })
      });
      const j = await r.json();
      if (j.url) window.location.href = j.url;
    } catch (error) {
      console.error('Failed to create topup session:', error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">AI Reply Credits</h3>
        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
          {bal === null ? "…" : `${bal} left`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={()=>buy("200")}  
          disabled={busy!==null} 
          className="px-3 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy==="200" ? "…" : "Buy 200"}
        </button>
        <button 
          onClick={()=>buy("1000")} 
          disabled={busy!==null} 
          className="px-3 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy==="1000" ? "…" : "Buy 1,000"}
        </button>
        <button 
          onClick={()=>buy("5000")} 
          disabled={busy!==null} 
          className="px-3 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy==="5000" ? "…" : "Buy 5,000"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Credits are used first. When 0, metered billing applies automatically.
      </p>
    </div>
  );
} 