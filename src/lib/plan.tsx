"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type Plan = "free" | "pro" | string;

export function usePlan() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>("free");
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser({ id: user.id, email: user.email ?? null });

      const { data } = await supabaseClient
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      setPlan((data?.subscription_status as Plan) ?? "free");
      setLoading(false);
    })();
  }, []);

  return { loading, plan, user };
}

export function PlanGate({
  require = "pro",
  fallback,
  children,
}: {
  require?: Plan;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { loading, plan } = usePlan();
  if (loading) return <div className="text-sm text-neutral-500">Checking plan…</div>;
  if (plan !== require) return <>{fallback ?? <UpsellCard />}</>;
  return <>{children}</>;
}

export function UpsellCard() {
  const { user } = usePlan();
  const [busy, setBusy] = useState<"upgrade" | "portal" | null>(null);

  if (!user) {
    return (
      <div className="rounded-xl border p-4">
        <h4 className="font-semibold">Pro feature</h4>
        <p className="mt-1 text-sm text-neutral-600">Sign in to upgrade and unlock this.</p>
        <a href="/signup" className="mt-3 inline-block rounded-lg border px-3 py-2">Sign in</a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <h4 className="font-semibold">Unlock Pro</h4>
      <p className="mt-1 text-sm text-neutral-600">
        Upgrade to Pro to access this feature. Billing is LIVE.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-lg border px-3 py-2"
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
        <button
          className="rounded-lg border px-3 py-2"
          disabled={!!busy}
          onClick={async () => {
            setBusy("portal");
            const r = await fetch("/api/billing/portal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ user_id: user.id, email: user.email ?? undefined }),
            });
            const { url } = await r.json();
            window.location.href = url;
          }}
        >
          {busy === "portal" ? "Opening…" : "Manage Subscription"}
        </button>
      </div>
    </div>
  );
} 