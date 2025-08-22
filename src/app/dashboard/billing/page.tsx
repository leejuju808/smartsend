"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { canManageBilling } from "@/utils/permissions";

export default function BillingPage() {
  const supabase = createClientComponentClient();
  const [workspace, setWorkspace] = useState<any | null>(null);
  const [seatCount, setSeatCount] = useState<number>(1);
  const [email, setEmail] = useState<string>("");
  const [myRole, setMyRole] = useState<string | null>(null);
  const [usedSeats, setUsedSeats] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || "");
      const { data } = await supabase
        .from("workspace_members")
        .select("role, workspace_id, workspaces(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      const ws = (data as any)?.workspaces || null;
      setMyRole((data as any)?.role ?? null);
      setWorkspace(ws);
      if (ws?.seat_limit) setSeatCount(ws.seat_limit);
      if (ws?.member_count != null) setUsedSeats(ws.member_count);
    })();
  }, [supabase]);

  async function handleCheckout(priceId?: string) {
    if (!workspace) return;
    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, email, seatCount, priceId }),
    });
    const json = await res.json();
    if (json?.url) window.location.href = json.url;
  }

  if (!canManageBilling(myRole)) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">Billing</h1>
        <p className="text-sm text-gray-600">Only workspace owners can manage billing.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium">Current Plan</div>
            <div className="text-sm text-gray-600">{workspace?.subscription_status || "free"}</div>
          </div>
        </div>

        <p className="text-sm">{usedSeats} of {workspace?.seat_limit ?? seatCount} seats used</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Seat count</label>
            <input
              type="number"
              min={1}
              value={seatCount}
              onChange={e => setSeatCount(Math.max(1, Number(e.target.value)))}
              className="mt-1 w-full rounded-xl border p-2"
            />
          </div>
        </div>

        <button onClick={() => handleCheckout()} className="rounded-2xl bg-black px-4 py-2 text-white">
          Upgrade / Change Seats
        </button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER as any)}
            className="rounded-2xl border px-4 py-2"
          >
            Upgrade to Starter (1 seat)
          </button>
          <button
            onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM as any)}
            className="rounded-2xl border px-4 py-2"
          >
            Upgrade to Team (5 seats)
          </button>
          <button
            onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO as any)}
            className="rounded-2xl border px-4 py-2"
          >
            Upgrade to Pro (20 seats)
          </button>
        </div>

        <p className="text-xs text-gray-500">
          You’ll be taken to a secure Stripe Checkout page to complete your subscription.
        </p>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-sm font-medium">Already subscribed?</div>
        <button
          onClick={async () => {
            const res = await fetch("/api/stripe/portal", { method: "POST" });
            const { url } = await res.json();
            window.location.href = url;
          }}
          className="mt-2 rounded-2xl border px-4 py-2"
        >
          Manage billing
        </button>
      </div>
    </div>
  );
}
