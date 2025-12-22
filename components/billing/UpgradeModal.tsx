"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export function UpgradeModal({
  open, onOpenChange, reason
}: { open: boolean; onOpenChange: (v: boolean) => void; reason?: string; }) {
  async function goCheckout() {
    const res = await fetch("/api/billing/checkout", { method: "POST" });
    const json = await res.json();
    if (!res.ok || json.ok === false) return toast.error(json.message ?? "Checkout error");
    window.location.href = json.url;
  }
  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    if (!res.ok || json.ok === false) return toast.error(json.message ?? "Portal error");
    window.location.href = json.url;
  }
  
  const getReasonMessage = () => {
    if (reason === "daily_send_cap_reached") {
      return "Daily send limit reached.";
    }
    if (reason === "seat_over_cap") {
      return "You have more members than your plan allows.";
    }
    return reason || "Unlock higher limits and scale your outreach.";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Upgrade Required</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            Your workspace has reached its limit:
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 p-3 bg-muted rounded text-sm">
          {getReasonMessage()}
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button className="w-full" onClick={() => (window.location.href = "/billing")}>
            View Plans & Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function UpgradeModal(props: {
  cta?: string;
  priceId?: string;
  workspaceId?: string;
  children?: React.ReactNode; // optional custom trigger
}) {
  const [loading, setLoading] = React.useState(false);

  async function goCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: props.priceId || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
          metadata: props.workspaceId ? { workspace_id: props.workspaceId } : undefined
        })
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else alert("Unable to start checkout. Configure Stripe keys & price id.");
    } finally {
      setLoading(false);
    }
  }

  const Trigger = props.children ? (
    <DialogTrigger asChild>{props.children}</DialogTrigger>
  ) : (
    <DialogTrigger asChild><Button variant="default">{props.cta || "Upgrade"}</Button></DialogTrigger>
  );

  return (
    <Dialog>
      {Trigger}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Unlock Send Safety Auto-Fix</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Auto-exclude suppressed/invalid contacts with one click and auto-suppress role accounts on import.</p>
          <ul className="list-disc pl-4">
            <li>Higher deliverability & inboxing</li>
            <li>Cleaner sends → more meetings (MB/100 ↑)</li>
            <li>Priority support</li>
          </ul>
          <Button onClick={goCheckout} disabled={loading}>
            {loading ? "Redirecting…" : "Upgrade now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}