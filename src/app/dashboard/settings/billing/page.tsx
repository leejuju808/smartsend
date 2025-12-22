"use client";

import { useEffect, useState } from "react";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  current_period_end: string;
  stripe_customer_id?: string;
}

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/billing/subscription");
        const j = await res.json();
        setSub(j.data);
      } catch (error) {
        console.error("Error fetching subscription:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function upgrade(plan: string) {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to start checkout");
        return;
      }

      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        alert("No checkout URL received");
      }
    } catch (error) {
      console.error("Upgrade error:", error);
      alert("Failed to start upgrade");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Billing</h1>
      
      {sub ? (
        <div className="p-4 border rounded-2xl space-y-2">
          <p>
            Current plan: <strong className="capitalize">{sub.plan}</strong>
          </p>
          <p>Status: <span className="capitalize">{sub.status}</span></p>
          {sub.current_period_end && (
            <p>
              Renews: {new Date(sub.current_period_end).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <p className="text-gray-500">No subscription found.</p>
      )}

      <div className="space-y-2">
        <button
          onClick={() => upgrade("pro")}
          className="px-4 py-2 bg-primary text-white rounded-xl hover:opacity-90 transition"
        >
          Upgrade to Pro ($29/mo)
        </button>
        <button
          onClick={() => upgrade("agency")}
          className="px-4 py-2 bg-primary text-white rounded-xl hover:opacity-90 transition"
        >
          Upgrade to Agency ($99/mo)
        </button>
      </div>
    </div>
  );
}

