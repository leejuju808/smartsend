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
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [manageBillingLoading, setManageBillingLoading] = useState(false);

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
      if (ws?.subscription_status) setSeatCount(ws.seat_limit);
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

  async function upgradeToPro() {
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        alert(j.error || "Upgrade failed");
        setUpgradeLoading(false);
      }
    } catch (error) {
      alert("Upgrade failed");
      setUpgradeLoading(false);
    }
  }

  async function manageBilling() {
    setManageBillingLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        alert(j.error || "Failed to open billing portal");
        setManageBillingLoading(false);
      }
    } catch (error) {
      alert("Failed to open billing portal");
      setManageBillingLoading(false);
    }
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

      {/* Current Plan Status */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium">Current Plan</div>
            <div className="text-sm text-gray-600 capitalize">{workspace?.subscription_status || "free"}</div>
          </div>
          {workspace?.subscription_status === "pro" && (
            <button
              onClick={manageBilling}
              disabled={manageBillingLoading}
              className="px-6 py-3 rounded-xl border font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {manageBillingLoading ? "Opening..." : "Manage billing"}
            </button>
          )}
        </div>

        {workspace?.subscription_status === "pro" && (
          <p className="text-sm">{usedSeats} of {workspace?.seat_limit ?? seatCount} seats used</p>
        )}
      </div>

      {/* Upgrade Section - Only show if not pro */}
      {workspace?.subscription_status !== "pro" && (
        <div className="rounded-2xl border p-5 space-y-4 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="text-center">
            <h2 className="text-lg font-medium text-gray-900">Upgrade to Pro</h2>
            <p className="text-sm text-gray-600 mt-1">
              Unlock campaigns, AI writing, and automations
            </p>
          </div>
          <button
            onClick={upgradeToPro}
            disabled={upgradeLoading}
            className="w-full px-6 py-3 rounded-xl bg-black text-white font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
          >
            {upgradeLoading ? "Redirecting..." : "Upgrade to Pro"}
          </button>
        </div>
      )}

      {/* Seat Management - Only show if pro */}
      {workspace?.subscription_status === "pro" && (
        <div className="rounded-2xl border p-5 space-y-4">
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
            Change Seats
          </button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER as any)}
              className="rounded-2xl border px-4 py-2"
            >
              Starter (1 seat)
            </button>
            <button
              onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM as any)}
              className="rounded-2xl border px-4 py-2"
            >
              Team (5 seats)
            </button>
            <button
              onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO as any)}
              className="rounded-2xl border px-4 py-2"
            >
              Pro (20 seats)
            </button>
          </div>

          <p className="text-xs text-gray-500">
            You'll be taken to a secure Stripe Checkout page to complete your subscription.
          </p>
        </div>
      )}

      {/* Legacy upgrade buttons - Only show if not pro */}
      {workspace?.subscription_status !== "pro" && (
        <div className="rounded-2xl border p-5 space-y-4">
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
            You'll be taken to a secure Stripe Checkout page to complete your subscription.
          </p>
        </div>
      )}
    </div>
  );
}
