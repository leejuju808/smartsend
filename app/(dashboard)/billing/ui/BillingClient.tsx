"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";
import { SendMeter } from "@/app/(dashboard)/components/SendMeter";
import { useBillingUsageSummary } from "@/lib/hooks/useBillingUsageSummary";
import { useBillingPlan } from "@/lib/hooks/useBillingPlan";
import { AlertTriangle, Mail, Reply, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const PRICES = {
  basic: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC ?? "",
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? "",
};
const TOPUP_1K_PRICE = process.env.NEXT_PUBLIC_STRIPE_TOPUP_1K ?? "";

type QuotaSummary = {
  baseMonthlyQuota: number;
  bonusCredits: number;
  carryoverCredits: number;
  sentThisWindow: number;
  remaining: number;
  total: number;
  windowStart: string | null;
  windowEnd: string | null;
  subscriptionStatus: string | null;
  hardEnforce: boolean;
};

type BillingStatusPayload = {
  quota: QuotaSummary;
  stripeCustomerId: string | null;
};

type DailySendStats = {
  sends_today: number;
  daily_limit: number;
  remaining: number;
  plan: string;
  can_send: boolean;
};

export default function BillingClient() {
  const [loading, setLoading] = React.useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = React.useState<BillingStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [redirecting, setRedirecting] = React.useState(false);
  const [dailySendStats, setDailySendStats] = React.useState<DailySendStats | null>(null);
  const [dailyStatsLoading, setDailyStatsLoading] = React.useState(true);
  const { data: usageData, loading: usageLoading, reload: reloadUsage } = useBillingUsageSummary();
  const { plan, state, loading: loadingPlan } = useBillingPlan();

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatusLoading(true);
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as BillingStatusPayload;
        if (!cancelled) {
          setQuotaStatus(payload);
        }
      } catch (error) {
        console.error("[BillingClient] Failed to load quota status", error);
        if (!cancelled) {
          setQuotaStatus(null);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch user's personal daily send stats
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setDailyStatsLoading(true);
      try {
        const response = await fetch("/api/billing/daily-sends", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as DailySendStats;
        if (!cancelled) {
          setDailySendStats(data);
        }
      } catch (error) {
        console.error("[BillingClient] Failed to load daily send stats", error);
        if (!cancelled) {
          setDailySendStats(null);
        }
      } finally {
        if (!cancelled) {
          setDailyStatsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const checkout = async (priceId: string) => {
    setLoading(priceId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? "Checkout failed");
    } finally {
      setLoading(null);
    }
  };

  const buyTopup = async (priceId: string) => {
    if (!quotaStatus?.stripeCustomerId) {
      toast.error("No Stripe customer associated with this account yet.");
      return;
    }

    setLoading(`topup:${priceId}`);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeCustomerId: quotaStatus.stripeCustomerId,
          priceId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      if (!url) throw new Error("Checkout URL missing");
      window.location.href = url;
    } catch (e: any) {
      console.error("[BillingClient] Top-up checkout failed", e);
      toast.error(e?.message ?? "Failed to start top-up checkout");
    } finally {
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setRedirecting(true);
    const res = await fetch("/api/billing/portal", {
      method: "POST",
    });

    setRedirecting(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg =
        json?.message ||
        json?.error ||
        "Could not open billing portal. Please contact support.";
      alert(msg);
      return;
    }

    const json = await res.json();
    if (json?.url) {
      window.location.href = json.url;
    } else {
      alert("No portal URL returned from billing.");
    }
  };

  const openPortal = async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open portal");
    } finally {
      setLoading(null);
    }
  };

  const usage = usageData?.usage;
  const lastSendCapEvent = usageData?.last_send_cap_event;
  const lastReplyCapEvent = usageData?.last_reply_cap_event;
  const sendCapStatus = usage?.send_cap_status || "ok";
  const showWarning = sendCapStatus === "near" || sendCapStatus === "reached";

  // Subscription status logic
  const subscriptionStatus = state?.subscription_status || null;
  const trialEndsAt = state?.trial_ends_at || null;

  let statusLabel = "No subscription";
  let statusVariant:
    | "trial"
    | "active"
    | "warning"
    | "canceled"
    | "none" = "none";
  let trialText: string | null = null;

  if (subscriptionStatus) {
    const s = subscriptionStatus;

    if (s === "trialing") {
      statusLabel = "Trial";
      statusVariant = "trial";

      if (trialEndsAt) {
        const end = new Date(trialEndsAt).getTime();
        const now = Date.now();
        const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          trialText = `${diffDays} day${diffDays === 1 ? "" : "s"} left in trial`;
        } else {
          trialText = "Trial ends today";
        }
      }
    } else if (s === "active") {
      statusLabel = "Active";
      statusVariant = "active";
    } else if (s === "past_due" || s === "unpaid") {
      statusLabel = "Past due";
      statusVariant = "warning";
    } else if (s === "canceled" || s === "incomplete_expired") {
      statusLabel = "Canceled";
      statusVariant = "canceled";
    } else {
      statusLabel = s;
      statusVariant = "none";
    }
  }
  const warningText =
    sendCapStatus === "reached"
      ? "Daily send cap reached — new sends are paused until tomorrow."
      : "You are close to your daily send cap.";
  const warningSub =
    sendCapStatus === "reached" && lastSendCapEvent
      ? `Last cap event: ${new Date(lastSendCapEvent.created_at).toLocaleString()}`
      : "";
  
  // Reply cap status
  const replyCapStatus: "ok" | "near" | "reached" = 
    usage?.daily_reply_cap && usage.daily_reply_cap > 0
      ? usage.replies_today >= usage.daily_reply_cap
        ? "reached"
        : usage.replies_today >= usage.daily_reply_cap * 0.8
        ? "near"
        : "ok"
      : "ok";
  const showReplyWarning = replyCapStatus === "near" || replyCapStatus === "reached";
  const replyWarningText =
    replyCapStatus === "reached"
      ? "Daily reply cap reached — AI reply processing is paused until tomorrow."
      : "You are close to your daily reply cap.";
  const replyWarningSub =
    replyCapStatus === "reached" && lastReplyCapEvent
      ? `Last cap event: ${new Date(lastReplyCapEvent.created_at).toLocaleString()}`
      : "";
  const sendRatio =
    usage && usage.daily_send_cap > 0
      ? `${usage.sends_today} / ${usage.daily_send_cap}`
      : usage
      ? `${usage.sends_today}`
      : "—";
  const replyCapText =
    usage?.daily_reply_cap && usage.daily_reply_cap > 0
      ? `${usage.replies_today} / ${usage.daily_reply_cap}`
      : usage
      ? `${usage.replies_today}`
      : "—";
  const seatsText =
    usage?.seat_limit && usage.seat_limit > 0
      ? `${usage.seats_used} / ${usage.seat_limit}`
      : usage
      ? `${usage.seats_used}`
      : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Billing & Usage</h1>
          <p className="text-xs text-muted-foreground">
            Track sends, replies, and seat usage against your current plan limits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-[11px]"
            onClick={reloadUsage}
          >
            Refresh usage
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-[11px]"
            onClick={handleManageBilling}
            disabled={redirecting}
          >
            {redirecting ? "Opening portal…" : "Manage billing / Upgrade"}
          </Button>
        </div>
      </div>

      {/* Usage Summary Section */}
      <div className="space-y-4">

        {/* Current plan card */}
        <Card className="bg-slate-950/80 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Current plan</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                Plan limits drive your daily send cap, reply cap, and seat limit.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {plan && (
                <Badge className="bg-slate-900/80 border-slate-600 text-[10px]">
                  {plan.id.toUpperCase()}
                </Badge>
              )}
              {statusVariant !== "none" && (
                <Badge
                  className={
                    "text-[10px] " +
                    (statusVariant === "trial"
                      ? "bg-emerald-900/80 border-emerald-600"
                      : statusVariant === "active"
                      ? "bg-slate-900/80 border-slate-600"
                      : statusVariant === "warning"
                      ? "bg-amber-900/80 border-amber-600"
                      : "bg-slate-900/80 border-slate-700")
                  }
                >
                  {statusLabel}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 text-xs flex flex-col gap-2">
            {loadingPlan ? (
              <p className="text-[11px] text-muted-foreground">
                Loading plan…
              </p>
            ) : !plan ? (
              <p className="text-[11px] text-muted-foreground">
                No plan is attached to this workspace yet. Use the button above
                to set up billing and choose a plan.
              </p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {plan.name}
                    </div>
                    {plan.description && (
                      <div className="text-[11px] text-muted-foreground">
                        {plan.description}
                      </div>
                    )}
                    {trialText && (
                      <div className="text-[10px] text-emerald-300 mt-1">
                        {trialText}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <Badge className="bg-slate-900/80 border-slate-600">
                      Sends/day:{" "}
                      {state?.override_daily_send_cap ??
                        plan.daily_send_cap}
                    </Badge>
                    <Badge className="bg-slate-900/80 border-slate-600">
                      Replies/day:{" "}
                      {state?.override_daily_reply_cap ??
                        plan.daily_reply_cap ??
                        "—"}
                    </Badge>
                    <Badge className="bg-slate-900/80 border-slate-600">
                      Seats:{" "}
                      {state?.override_seat_limit ??
                        plan.seat_limit ??
                        "—"}
                    </Badge>
                  </div>
                </div>
                {state &&
                  (state.override_daily_send_cap ||
                    state.override_daily_reply_cap ||
                    state.override_seat_limit) && (
                    <p className="text-[10px] text-muted-foreground">
                      Custom overrides are applied for this workspace.
                    </p>
                  )}
              </>
            )}
          </CardContent>
        </Card>

        {/* NEW: Sends used today meter */}
        {dailySendStats && (
          <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Sends used today
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {dailySendStats.sends_today} / {dailySendStats.daily_limit}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {dailySendStats.daily_limit > 0
                      ? Math.min(
                          Math.round(
                            (dailySendStats.sends_today /
                              dailySendStats.daily_limit) *
                              100
                          ),
                          100
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      (dailySendStats.sends_today / dailySendStats.daily_limit) *
                        100 <
                        70 && "bg-emerald-500",
                      (dailySendStats.sends_today / dailySendStats.daily_limit) *
                        100 >=
                        70 &&
                        (dailySendStats.sends_today /
                          dailySendStats.daily_limit) *
                          100 <
                          90 && "bg-amber-500",
                      (dailySendStats.sends_today / dailySendStats.daily_limit) *
                        100 >=
                        90 && "bg-red-500"
                    )}
                    style={{
                      width: `${
                        dailySendStats.daily_limit > 0
                          ? Math.min(
                              (dailySendStats.sends_today /
                                dailySendStats.daily_limit) *
                                100,
                              100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {(dailySendStats.sends_today / dailySendStats.daily_limit) *
                  100 >=
                  80 &&
                  dailySendStats.plan !== "pro" && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      You're close to your daily send cap. Upgrade to Pro for
                      higher limits.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ⚠️ Send cap banner */}
        {showWarning && usage && (
          <Card className="border-red-800 bg-red-950/40">
            <CardContent className="p-3 flex items-start gap-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-100">
                    {warningText}
                  </span>
                  <Badge className="bg-red-900/80 border-red-600 text-[10px]">
                    {sendCapStatus === "reached"
                      ? "Cap reached"
                      : "Approaching cap"}
                  </Badge>
                </div>
                <p className="text-[11px] text-red-100/80 mt-1">
                  Sends today: {sendRatio}. Your plan&apos;s daily cap is{" "}
                  {usage.daily_send_cap}. Upgrade to increase your daily send
                  volume.
                </p>
                {warningSub && (
                  <p className="text-[10px] text-red-100/70 mt-0.5">
                    {warningSub}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ⚠️ Reply cap banner */}
        {showReplyWarning && usage && usage.daily_reply_cap && (
          <Card className="border-orange-800 bg-orange-950/40">
            <CardContent className="p-3 flex items-start gap-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-orange-100">
                    {replyWarningText}
                  </span>
                  <Badge className="bg-orange-900/80 border-orange-600 text-[10px]">
                    {replyCapStatus === "reached"
                      ? "Cap reached"
                      : "Approaching cap"}
                  </Badge>
                </div>
                <p className="text-[11px] text-orange-100/80 mt-1">
                  Replies processed today: {replyCapText}. Your plan&apos;s daily reply cap is{" "}
                  {usage.daily_reply_cap}. Upgrade to increase your daily reply
                  processing volume.
                </p>
                {replyWarningSub && (
                  <p className="text-[10px] text-orange-100/70 mt-0.5">
                    {replyWarningSub}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Usage cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Sends */}
          <Card className="bg-slate-950/80 border-slate-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Sends today
              </CardTitle>
              {usage && (
                <Badge
                  className={
                    usage.send_cap_status === "reached"
                      ? "bg-red-900/80 border-red-600 text-[10px]"
                      : usage.send_cap_status === "near"
                      ? "bg-amber-900/80 border-amber-600 text-[10px]"
                      : "bg-emerald-900/70 border-emerald-600 text-[10px]"
                  }
                >
                  {usage.send_cap_status === "reached"
                    ? "Cap reached"
                    : usage.send_cap_status === "near"
                    ? "Near cap"
                    : "Within cap"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-1">
              <span className="text-xl font-semibold">
                {usageLoading ? "…" : sendRatio}
              </span>
              {usage && (
                <span className="text-[10px] text-muted-foreground">
                  {usage.overage_behavior === "hard_stop"
                    ? "Hard stop when cap is hit (no overages)."
                    : "Soft warn (temporary overages allowed)."}
                </span>
              )}
            </CardContent>
          </Card>

          {/* Replies */}
          <Card className="bg-slate-950/80 border-slate-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Reply className="h-4 w-4" />
                Replies processed
              </CardTitle>
              {usage?.daily_reply_cap && (
                <Badge
                  className={
                    replyCapStatus === "reached"
                      ? "bg-red-900/80 border-red-600 text-[10px]"
                      : replyCapStatus === "near"
                      ? "bg-amber-900/80 border-amber-600 text-[10px]"
                      : "bg-emerald-900/70 border-emerald-600 text-[10px]"
                  }
                >
                  {replyCapStatus === "reached"
                    ? "Cap reached"
                    : replyCapStatus === "near"
                    ? "Near cap"
                    : "Within cap"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-1">
              <span className="text-xl font-semibold">
                {usageLoading ? "…" : replyCapText}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Number of inbound replies handled by SmartSend today.
                {usage?.daily_reply_cap && replyCapStatus === "reached" && (
                  <span className="block mt-1 text-red-400">
                    AI reply processing paused until tomorrow.
                  </span>
                )}
              </span>
            </CardContent>
          </Card>

          {/* Seats */}
          <Card className="bg-slate-950/80 border-slate-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Seats
              </CardTitle>
              {usage?.seat_limit && (
                <Badge className="bg-slate-900/80 border-slate-600 text-[10px]">
                  Limit: {usage.seat_limit}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-1">
              <span className="text-xl font-semibold">
                {usageLoading ? "…" : seatsText}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Each team member in this workspace counts as a seat.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Existing Monthly Usage Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Monthly Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="text-sm text-muted-foreground">Loading usage…</div>
          ) : quotaStatus ? (
            <>
              <SendMeter
                sent={quotaStatus.quota.sentThisWindow}
                total={Math.max(1, quotaStatus.quota.total)}
                remaining={Math.max(0, quotaStatus.quota.remaining)}
                windowEnd={quotaStatus.quota.windowEnd}
              />

              {quotaStatus.quota.remaining <= 0 ? (
                <div
                  className={`mt-3 p-3 rounded-xl ${
                    quotaStatus.quota.hardEnforce
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {quotaStatus.quota.hardEnforce
                    ? `Out of credits. Buy a top-up or wait until ${quotaStatus.quota.windowEnd ? new Date(quotaStatus.quota.windowEnd).toLocaleString() : "next period"}.`
                    : "You’re out of credits, but scheduling will remain in soft mode. Consider a top-up to avoid pauses."}
                </div>
              ) : quotaStatus.quota.remaining <= 100 ? (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 text-amber-700">
                  You’re running low on credits ({quotaStatus.quota.remaining} left). Consider a top-up to avoid pauses.
                </div>
              ) : null}

              {quotaStatus.stripeCustomerId && TOPUP_1K_PRICE && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => buyTopup(TOPUP_1K_PRICE)}
                    disabled={loading === `topup:${TOPUP_1K_PRICE}`}
                  >
                    {loading === `topup:${TOPUP_1K_PRICE}` ? "Redirecting…" : "Buy 1,000 credits"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Quota data unavailable. Choose a plan to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <Plan
        name="Basic"
        price="$29/mo"
        features={[
          "Up to 5,000 emails/month",
          "Basic templates",
          "Open/Click tracking",
          "Email support",
        ]}
        action={() => checkout(PRICES.basic)}
        loading={loading === PRICES.basic}
      />
      <Plan
        name="Pro"
        price="$79/mo"
        features={[
          "Up to 25,000 emails/month",
          "Smart Template Rewriter (AI)",
          "Team access (5 seats)",
          "Priority support",
        ]}
        action={() => checkout(PRICES.pro)}
        loading={loading === PRICES.pro}
      />

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Manage Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={openPortal} disabled={loading === "portal"}>
            {loading === "portal" ? "Opening..." : "Open Customer Portal"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Plan({
  name, price, features, action, loading,
}: {
  name: string; price: string; features: string[];
  action: () => void; loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-semibold">{price}</div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {features.map((f) => <li key={f}>• {f}</li>)}
        </ul>
        <Button onClick={action} disabled={loading}>
          {loading ? "Redirecting…" : "Choose " + name}
        </Button>
      </CardContent>
    </Card>
  );
}
