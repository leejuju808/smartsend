"use client";
import { useState } from "react";
import { usePlan } from "@/lib/plan";

export default function PlanBadge() {
  const { loading, plan, user } = usePlan();
  const [busy, setBusy] = useState<"upgrade" | null>(null);

  if (loading) return <span className="text-xs text-neutral-500">…</span>;

  if (!user) {
    return (
      <a
        href="/signup"
        className="rounded-full border px-2 py-1 text-xs hover:bg-neutral-100"
      >
        Sign in
      </a>
    );
  }

  const isPro = plan === "pro";

  return (
    <div className="flex items-center gap-2">
      <a
        href="/account"
        className={`rounded-full border px-2 py-1 text-xs ${
          isPro ? "border-emerald-500" : "border-neutral-300"
        }`}
        title="Account & billing"
      >
        {isPro ? "Pro" : "Free"}
      </a>

      {!isPro && (
        <button
          className="rounded-full border px-3 py-1 text-xs hover:bg-neutral-100"
          disabled={!!busy}
          onClick={async () => {
            setBusy("upgrade");
            const r = await fetch("/api/billing/checkout", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ user_id: user.id, email: user.email ?? undefined }),
            });
            const { url } = await r.json();
            window.location.href = url;
          }}
        >
          {busy === "upgrade" ? "Redirecting…" : "Upgrade (LIVE)"}
        </button>
      )}
    </div>
  );
} 