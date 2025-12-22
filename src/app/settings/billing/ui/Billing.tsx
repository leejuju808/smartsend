"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillingAccount } from "@/hooks/useBillingAccount";
import { useToast } from "@/components/ui/toast/ToastProvider";

export default function Billing() {
  const sb = useMemo(supabaseBrowser, []);
  const { account: acc, loading } = useBillingAccount();
  const [seats, setSeats] = useState(1);
  const { push: pushToast } = useToast();

  useEffect(() => {
    if (typeof acc?.seats === "number") {
      setSeats(Math.max(1, acc.seats));
    }
  }, [acc?.seats]);

  async function checkout(plan: "starter" | "pro" | "team") {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${process.env.NEXT_PUBLIC_EDGE_URL}/stripe-create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan, seats }),
    });
    const j = await res.json();
    if (j.ok) {
      window.location.href = j.url;
    } else {
      pushToast({ type: "error", title: "Checkout failed", description: j.error ?? "Unable to start checkout." });
    }
  }

  async function portal() {
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const detail = await res.text();
      pushToast({ type: "error", title: "Portal unavailable", description: detail || "Could not open billing portal." });
      return;
    }
    const { url } = await res.json();
    if (url) {
      window.location.href = url;
    } else {
      pushToast({ type: "error", title: "Portal unavailable", description: "No portal URL returned." });
    }
  }

  async function syncSeats() {
    const res = await fetch("/api/billing/sync-seats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      pushToast({ type: "success", title: "Seats synced to Stripe" });
    } else {
      let message = "Sync failed";
      try {
        const payload = await res.json();
        message = payload?.error || message;
      } catch {
        message = await res.text();
      }
      pushToast({ type: "error", title: "Sync failed", description: message || "Unable to sync seats." });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        {!loading && acc && (
          <p className="text-sm opacity-70">
            Plan: <b>{acc.plan}</b> • Status: <b>{acc.status}</b>{" "}
            {acc.period_end ? `• Renews: ${new Date(acc.period_end).toLocaleString()}` : ""}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          { name: "Starter", key: "starter", blurb: "Up to 5 campaigns, 5k leads/mo", price: "$29/mo" },
          { name: "Pro", key: "pro", blurb: "High-volume campaigns, 25k leads/mo", price: "$79/mo" },
          { name: "Team", key: "team", blurb: "Everything Pro + seats", price: "$149/mo + $9/seat" },
        ].map((card) => (
          <div key={card.key} className="p-5 rounded-2xl border flex flex-col justify-between">
            <div>
              <div className="text-lg font-semibold">{card.name}</div>
              <div className="text-sm opacity-70">{card.blurb}</div>
              <div className="text-2xl mt-3">{card.price}</div>
            </div>
            <div className="mt-4">
              {card.key !== "team" ? (
                <Button className="w-full" onClick={() => checkout(card.key as "starter" | "pro")}>
                  Choose {card.name}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm">Seats</div>
                  <Input
                    type="number"
                    min={1}
                    value={seats}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value || "1", 10);
                      setSeats(Number.isNaN(parsed) ? 1 : Math.max(1, parsed));
                    }}
                  />
                  <Button className="w-full" onClick={() => checkout("team")}>
                    Choose Team
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={portal}>
          Manage subscription
        </Button>
        <Button variant="secondary" onClick={syncSeats}>
          Sync seats to Stripe
        </Button>
      </div>
    </div>
  );
}

