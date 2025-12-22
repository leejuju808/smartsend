"use client";

import Link from "next/link";
import { useBillingStatus } from "@/lib/hooks/useBillingStatus";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard } from "lucide-react";

export function BillingStatusNudge() {
  const { data, loading } = useBillingStatus();

  if (loading || !data) return null;

  if (data.can_send) return null; // only show if blocked

  const reason = data.reason_code;

  let title = "Billing issue";
  let description =
    "There is a billing issue with this workspace. New sends are currently blocked.";
  let badgeText = "Action required";

  if (reason === "no_plan") {
    title = "No plan selected";
    description =
      "This workspace does not have an active plan yet. Set up billing to unlock sends.";
    badgeText = "Setup required";
  } else if (reason === "no_subscription") {
    title = "Subscription missing";
    description =
      "This workspace has a plan but no active subscription. Finish checkout or update billing to send emails.";
    badgeText = "Setup required";
  } else if (reason === "payment_issue") {
    title = "Payment issue";
    description =
      "There is a payment problem with this subscription (past due / unpaid). Update your payment method to resume sending.";
    badgeText = "Payment issue";
  } else if (reason === "subscription_canceled") {
    title = "Subscription canceled";
    description =
      "This subscription has been canceled. Choose a new plan to resume sending.";
    badgeText = "Canceled";
  }

  return (
    <Card className="border-amber-800 bg-amber-950/40">
      <CardContent className="p-3 flex items-start gap-3 text-xs">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-amber-100">
              {title}
            </span>
            <Badge className="bg-amber-900/80 border-amber-600 text-[10px]">
              {badgeText}
            </Badge>
          </div>
          <p className="text-[11px] text-amber-100/80 mt-1">
            {description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-100 hover:text-amber-50"
            >
              <CreditCard className="h-3 w-3" />
              Go to Billing to fix this
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





