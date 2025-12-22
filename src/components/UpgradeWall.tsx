"use client";
import { useEffect, useState } from "react";

export default function UpgradeWall() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState<{id:string; expires:number; percent:number} | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/gates/status").then(r=>r.json()).then(async (j) => {
      if (!j.gated) return setLoading(false);
      // Create/Fetch promo
      const r2 = await fetch("/api/promo/create", { method:"POST" });
      const p = await r2.json();
      if (p?.promotion_code_id && p?.expires_at) {
        const expires = new Date(p.expires_at).getTime();
        setPromo({ id: p.promotion_code_id, expires, percent: p.percent_off ?? 20 });
        setShow(true);
      }
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (!promo) return;
    const tick = () => setCount(Math.max(0, Math.floor((promo.expires - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [promo]);

  if (loading || !show || !promo) return null;

  const mins = Math.floor(count/60), secs = count%60;
  const expired = count <= 0;

  async function go(plan: "monthly"|"annual" = "monthly") {
    if (!promo) return;
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ plan, promotion_code: promo.id })
    });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md text-center space-y-4 shadow-xl">
        <h2 className="text-xl font-bold">🔥 {promo.percent}% off — Today Only</h2>
        <p className="text-sm text-gray-600">
          Unlock higher reply limits, bigger imports, and full extension access.
        </p>

        <div className="text-lg font-mono">
          {expired ? "Offer expired" : `Offer ends in ${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => go("monthly")}
            disabled={expired}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            Upgrade Monthly
          </button>
          <button
            onClick={() => go("annual")}
            disabled={expired}
            className="px-4 py-2 rounded border"
          >
            Go Annual (save more)
          </button>
        </div>

        <button onClick={() => setShow(false)} className="text-xs text-gray-500 underline">
          Maybe later
        </button>
      </div>
    </div>
  );
} 