"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function BillingPanel() {
  const [loading, setLoading] = useState(false);

  async function startCheckout(plan_id: string) {
    setLoading(true);
    const res = await fetch("/api/billing/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "your-workspace-id", plan_id }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <h3 className="text-lg font-semibold">💰 Billing & Plans</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded-xl p-3">
          <h4 className="font-semibold">Free</h4>
          <p className="text-sm text-zinc-600">50 emails/day</p>
          <Button disabled className="mt-2 w-full">Current Plan</Button>
        </div>
        <div className="border rounded-xl p-3">
          <h4 className="font-semibold">Pro – $29/mo</h4>
          <p className="text-sm text-zinc-600">500 emails/day, team invites</p>
          <Button onClick={()=>startCheckout("pro")} className="mt-2 w-full" disabled={loading}>Upgrade</Button>
        </div>
        <div className="border rounded-xl p-3">
          <h4 className="font-semibold">Enterprise – $99/mo</h4>
          <p className="text-sm text-zinc-600">5K emails/day, API access</p>
          <Button onClick={()=>startCheckout("enterprise")} className="mt-2 w-full" disabled={loading}>Upgrade</Button>
        </div>
      </div>
    </div>
  );
}