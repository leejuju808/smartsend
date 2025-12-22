"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BillingClient({ active, subscription }: any) {
  const [loading, setLoading] = useState(false);
  const status = subscription?.status ?? "none";

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Billing</h1>
      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">SmartSend Pro</p>
        <p className="text-xs text-muted-foreground">
          Campaigns, sequences, AI rewriter, unified inbox, safety engine, and more.
        </p>
        <div className="flex items-center gap-2 text-xs mt-2">
          <span className="font-semibold">Status:</span>
          <span
            className={
              active
                ? "text-green-600 font-medium"
                : "text-red-600 font-medium"
            }
          >
            {active ? "Active" : "Not active"}
          </span>
          {subscription && (
            <span className="text-[11px] text-muted-foreground">
              ({status})
            </span>
          )}
        </div>
        {subscription?.current_period_end && (
          <p className="text-[11px] text-muted-foreground">
            Renews / ends:{" "}
            {new Date(subscription.current_period_end).toLocaleDateString()}
          </p>
        )}
        <Button
          className="mt-3"
          onClick={startCheckout}
          disabled={loading}
        >
          {active ? "Manage subscription" : "Start subscription"}
        </Button>
      </Card>
    </div>
  );
}


































































