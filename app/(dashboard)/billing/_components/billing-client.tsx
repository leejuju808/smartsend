// app/(dashboard)/billing/_components/billing-client.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface BillingData {
  email: string;
  plan: string;
  plan_status: string;
  plan_renews_at: string | null;
  has_subscription: boolean;
}

export function BillingClient({ data }: { data: BillingData }) {
  const [loadingCheckout, setLoadingCheckout] = React.useState(false);
  const [loadingPortal, setLoadingPortal] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isPro = data.plan === "pro" && data.plan_status !== "canceled";

  const handleUpgrade = async () => {
    setError(null);
    setLoadingCheckout(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json?.error || "Failed to start checkout.");
        return;
      }
      window.location.href = json.url;
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handlePortal = async () => {
    setError(null);
    setLoadingPortal(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json?.error || "Failed to open billing portal.");
        return;
      }
      window.location.href = json.url;
    } finally {
      setLoadingPortal(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
      {/* Plan card */}
      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Current plan
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-semibold capitalize">
                  {data.plan || "free"}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {data.plan_status || (isPro ? "active" : "inactive")}
                </Badge>
              </div>
              {data.plan_renews_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Renews on{" "}
                  {new Date(data.plan_renews_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>{data.email}</div>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            {isPro ? (
              <ul className="list-disc list-inside space-y-1">
                <li>Higher send limits per day</li>
                <li>AI reply intent + auto-hot-lead alerts</li>
                <li>Team campaign sharing</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-1">
                <li>Basic campaigns & sending</li>
                <li>Upgrade to Pro for higher limits and AI features</li>
              </ul>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive mt-1">{error}</p>
          )}
          <div className="flex gap-3">
            {!isPro && (
              <Button
                onClick={handleUpgrade}
                disabled={loadingCheckout}
                className="text-sm"
              >
                {loadingCheckout ? "Redirecting…" : "Upgrade to Pro"}
              </Button>
            )}
            {data.has_subscription && (
              <Button
                variant="outline"
                onClick={handlePortal}
                disabled={loadingPortal}
                className="text-sm"
              >
                {loadingPortal ? "Opening…" : "Manage billing"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan comparison / marketing */}
      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pro plan includes
          </p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>✅ Higher daily send limits</li>
            <li>✅ AI reply intent classification</li>
            <li>✅ Auto hot-lead notifications</li>
            <li>✅ Smart reply drafts & template rewriter</li>
            <li>✅ Team campaign sharing</li>
          </ul>
          <p className="text-xs text-muted-foreground/80 mt-2">
            You can cancel anytime in the billing portal. Changes take effect at
            the end of your current billing period.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}































































