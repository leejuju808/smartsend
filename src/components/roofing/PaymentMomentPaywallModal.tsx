"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Plan = "starter" | "growth" | "domination";

export function PaymentMomentPaywallModal({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);

  const startCheckout = async (plan: Plan) => {
    try {
      setLoadingPlan(plan);
      const res = await fetch("/api/roofing/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, plan }),
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Failed to start checkout");
      }

      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to start checkout");
      setLoadingPlan(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You’re Closing Jobs With SmartSend</DialogTitle>
          <DialogDescription>
            You’ve sent real estimates to real homeowners. Unlock higher sending limits and keep momentum.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            onClick={() => startCheckout("starter")}
            disabled={!!loadingPlan}
          >
            {loadingPlan === "starter" ? "Starting..." : "Start Starter Plan"}
          </Button>
          <Button
            variant="outline"
            onClick={() => startCheckout("growth")}
            disabled={!!loadingPlan}
          >
            {loadingPlan === "growth" ? "Starting..." : "Upgrade to Growth"}
          </Button>
          <Button
            variant="outline"
            onClick={() => startCheckout("domination")}
            disabled={!!loadingPlan}
          >
            {loadingPlan === "domination" ? "Starting..." : "Upgrade to Domination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



