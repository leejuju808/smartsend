"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/billing/UpgradeModal";

type Props = {
  workspaceId: string;
  className?: string;
};

/**
 * Shows "Manage billing" when a Stripe customer exists, otherwise "Upgrade".
 * We infer presence of a customer by attempting to create a portal session; if it fails with 400, we show Upgrade.
 */
export function BillingButton({ workspaceId, className }: Props) {
  const [hasPortal, setHasPortal] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // lightweight probe: try to create a portal session with dry-run flag
    (async () => {
      try {
        const res = await fetch("/api/profile/plan?workspaceId=" + workspaceId);
        if (!res.ok) throw new Error("plan fetch failed");
        // We don't actually know if stripe_customer exists; we discover lazily on click.
        setHasPortal(true); // default optimistic; we'll fall back to upgrade if portal creation fails.
      } catch {
        setHasPortal(false);
      }
    })();
  }, [workspaceId]);

  async function goPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, returnUrl: window.location.href }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      // Fallback: no customer yet → prompt upgrade
      setHasPortal(false);
    } finally {
      setLoading(false);
    }
  }

  if (hasPortal === false) {
    return (
      <UpgradeModal workspaceId={workspaceId}>
        <Button className={className} variant="default">Upgrade</Button>
      </UpgradeModal>
    );
  }

  return (
    <Button className={className} variant="outline" onClick={goPortal} disabled={loading}>
      {loading ? "Opening…" : "Manage billing"}
    </Button>
  );
}