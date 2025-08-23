"use client";
import { useEffect, useState } from "react";

export default function TimedOffer() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState<{id:string; expires:number; percent:number} | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Check if user is not pro and create/fetch promo
    const checkAndCreatePromo = async () => {
      try {
        // Check subscription status
        const statusRes = await fetch("/api/me");
        const statusData = await statusRes.json();
        
        if (statusData.subscription_status === "pro") {
          setLoading(false);
          return;
        }

        // Create/Fetch promo
        const promoRes = await fetch("/api/promo/create", { method: "POST" });
        const promoData = await promoRes.json();
        
        if (promoData?.promotion_code_id && promoData?.expires_at) {
          const expires = new Date(promoData.expires_at).getTime();
          setPromo({ 
            id: promoData.promotion_code_id, 
            expires, 
            percent: promoData.percent_off ?? 20 
          });
          setShow(true);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error creating promo:", error);
        setLoading(false);
      }
    };

    checkAndCreatePromo();
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
    <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-6 mb-6">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">🔥</span>
          <h3 className="text-xl font-bold text-orange-800">
            Limited Time: {promo.percent}% Off Pro
          </h3>
          <span className="text-2xl">🔥</span>
        </div>
        
        <p className="text-sm text-orange-700">
          Unlock unlimited replies, bigger imports, and full extension access.
        </p>

        <div className="text-lg font-mono bg-white px-4 py-2 rounded border-2 border-orange-300 inline-block">
          {expired ? (
            <span className="text-red-600">Offer expired</span>
          ) : (
            <span className="text-orange-800">
              Ends in {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
            </span>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => go("monthly")}
            disabled={expired}
            className="px-6 py-3 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Upgrade Monthly
          </button>
          <button
            onClick={() => go("annual")}
            disabled={expired}
            className="px-6 py-3 rounded-lg border-2 border-orange-600 text-orange-700 font-semibold hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Go Annual (Save More)
          </button>
        </div>

        <button 
          onClick={() => setShow(false)} 
          className="text-xs text-orange-600 underline hover:text-orange-800"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
} 