"use client";
import { usePlan } from "@/lib/plan";
import { useState } from "react";

export default function AccountPlanPage() {
  const { loading, plan, user } = usePlan();
  const [busy, setBusy] = useState<"upgrade" | "portal" | null>(null);

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Account Plan</h1>
      <div className="mt-4 rounded-xl border p-4">
        <div className="text-sm text-neutral-600">Signed in as</div>
        <div className="mt-1">{user?.email ?? "Unknown"}</div>
        <div className="mt-3">
          <span className="text-sm text-neutral-600">Plan: </span>
          <span className="rounded-full border px-2 py-0.5 text-sm">{plan}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="rounded-lg border px-3 py-2"
            disabled={!!busy || !user}
            onClick={async () => {
              setBusy("upgrade");
              const r = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ user_id: user?.id, email: user?.email ?? undefined }),
              });
              const { url } = await r.json();
              window.location.href = url;
            }}
          >
            {busy === "upgrade" ? "Redirecting…" : "Upgrade (LIVE)"}
          </button>

          <button
            className="rounded-lg border px-3 py-2"
            disabled={!!busy || !user}
            onClick={async () => {
              setBusy("portal");
              const r = await fetch("/api/billing/portal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ user_id: user?.id, email: user?.email ?? undefined }),
              });
              const { url } = await r.json();
              window.location.href = url;
            }}
          >
            {busy === "portal" ? "Opening…" : "Manage Subscription"}
          </button>
        </div>
      </div>
    </main>
  );
} 