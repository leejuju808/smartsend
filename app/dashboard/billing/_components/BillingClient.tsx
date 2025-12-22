// app/dashboard/billing/_components/BillingClient.tsx
"use client";

import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";

type PlanRow = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  max_campaigns: number | null;
  max_emails_per_month: number | null;
};

type SubscriptionRow = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
} | null;

interface Props {
  plans: PlanRow[];
  subscription: SubscriptionRow;
}

function formatPrice(price_cents: number, currency: string) {
  const amt = price_cents / 100;
  return amt.toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
}

function statusLabel(status?: string) {
  if (!status) return "inactive";
  return status.replace("_", " ");
}

export default function BillingClient({ plans, subscription }: Props) {
  const [isLoading, startTransition] = useTransition();

  async function startCheckout(planId: string) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });

        if (!res.ok) {
          console.error("Checkout error:", await res.text());
          return;
        }

        const json = await res.json();
        if (json.url) {
          window.location.href = json.url;
        }
      } catch (err) {
        console.error("Checkout error:", err);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Choose a plan and keep SmartSend running as your lead engine.
          </p>
        </div>

        <div className="rounded-xl border bg-card px-4 py-3 text-xs">
          <p className="text-[11px] text-muted-foreground">Current plan</p>
          <p className="mt-[2px] text-sm font-semibold">
            {subscription?.plan_id
              ? subscription.plan_id.charAt(0).toUpperCase() +
                subscription.plan_id.slice(1)
              : "None"}
          </p>
          <p className="mt-[2px] text-[10px] text-muted-foreground">
            Status: {statusLabel(subscription?.status)}
          </p>
          {subscription?.current_period_end && (
            <p className="mt-[2px] text-[10px] text-muted-foreground">
              Renews {formatDistanceToNow(
                new Date(subscription.current_period_end),
                { addSuffix: true }
              )}
            </p>
          )}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent =
            subscription && subscription.plan_id === plan.id &&
            subscription.status === "active";

          const campaignText =
            plan.max_campaigns != null
              ? `${plan.max_campaigns} campaign${
                  plan.max_campaigns === 1 ? "" : "s"
                }`
              : "Unlimited campaigns";

          const emailsText =
            plan.max_emails_per_month != null
              ? `${plan.max_emails_per_month.toLocaleString()} emails / month`
              : "Unlimited emails*";

          return (
            <article
              key={plan.id}
              className="flex flex-col justify-between rounded-2xl border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-2xl font-bold">
                  {formatPrice(plan.price_cents, plan.currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /month
                  </span>
                </p>

                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• {campaignText}</li>
                  <li>• {emailsText}</li>
                  {plan.id === "starter" && (
                    <>
                      <li>• Basic AI personalization</li>
                      <li>• Reply monitoring</li>
                    </>
                  )}
                  {plan.id === "growth" && (
                    <>
                      <li>• Advanced AI + follow-up logic</li>
                      <li>• 3 active campaigns at once</li>
                      <li>• Priority support</li>
                    </>
                  )}
                  {plan.id === "domination" && (
                    <>
                      <li>• Full automation + dashboards</li>
                      <li>• Unlimited scale</li>
                      <li>• VIP onboarding for your team</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="mt-4 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  disabled={isLoading || isCurrent}
                  onClick={() => startCheckout(plan.id)}
                  className="rounded-full bg-primary px-4 py-[6px] text-xs font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCurrent ? "Current plan" : "Choose plan"}
                </button>
                <span className="text-[10px] text-muted-foreground">
                  Billed monthly via Stripe. Cancel anytime.
                </span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}


























































