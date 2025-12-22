"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_METADATA, PLANS, PlanKey } from "@/lib/plans";
import { UpgradeModal } from "@/components/UpgradeModal";
import { createClient } from "@supabase/supabase-js";
// Get workspace from URL or cookie

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Block 417: Billing Settings Page
 * Shows current plan, usage vs limits, and upgrade options
 */
export default function BillingPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    plan_key: PlanKey;
    status: string;
    current_period_end: string | null;
  } | null>(null);
  const [usage, setUsage] = useState<{
    leads: number;
    dailySends: number;
    seats: number;
  }>({ leads: 0, dailySends: 0, seats: 0 });
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState<{
    open: boolean;
    feature?: string;
    message?: string;
    current?: number;
    limit?: number;
  }>({ open: false });

  useEffect(() => {
    // Get workspace ID from cookie or API
    (async () => {
      const wid = document.cookie
        .split("; ")
        .find((row) => row.startsWith("active_wid="))
        ?.split("=")[1];
      
      if (wid) {
        setWorkspaceId(wid);
      } else {
        // Fallback: fetch from API
        try {
          const res = await fetch("/api/workspaces/current");
          const data = await res.json();
          if (data.workspace_id) {
            setWorkspaceId(data.workspace_id);
          }
        } catch (error) {
          console.error("Error fetching workspace:", error);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    (async () => {
      try {
        // Get subscription
        const { data: sub } = await supabase
          .from("workspace_billing_subscriptions")
          .select("plan_key, plan_code, status, current_period_end")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        const plan_key = (sub?.plan_key || sub?.plan_code?.toLowerCase() || "free") as PlanKey;

        setSubscription({
          plan_key,
          status: sub?.status || "inactive",
          current_period_end: sub?.current_period_end || null,
        });

        // Get usage stats
        const today = new Date().toISOString().split("T")[0];

        // Count leads
        const { count: leadsCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);

        // Count daily sends
        const { count: sendsCount } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("event_type", "sent")
          .gte("created_at", today);

        // Count seats
        const { count: seatsCount } = await supabase
          .from("workspace_members")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);

        setUsage({
          leads: leadsCount || 0,
          dailySends: sendsCount || 0,
          seats: seatsCount || 0,
        });
      } catch (error) {
        console.error("Error loading billing data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  const currentPlan = subscription?.plan_key || "free";
  const planLimits = PLANS[currentPlan];
  const planMeta = PLAN_METADATA[currentPlan];

  const handleUpgrade = async (targetPlan: PlanKey) => {
    // Redirect to Stripe Checkout
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          plan: targetPlan,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error initiating checkout:", error);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error opening portal:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading billing information...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription and view usage limits
        </p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                {subscription?.status === "active" || subscription?.status === "trialing"
                  ? "Your subscription is active"
                  : "No active subscription"}
              </CardDescription>
            </div>
            <Badge variant={subscription?.status === "active" ? "default" : "secondary"}>
              {planMeta.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Seats</div>
              <div className="text-lg font-semibold">
                {usage.seats} / {planLimits.seats}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Daily Sends</div>
              <div className="text-lg font-semibold">
                {usage.dailySends.toLocaleString()} / {planLimits.daily_sends.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Leads</div>
              <div className="text-lg font-semibold">
                {usage.leads.toLocaleString()} /{" "}
                {planLimits.max_leads ? planLimits.max_leads.toLocaleString() : "∞"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Domains</div>
              <div className="text-lg font-semibold">Up to {planLimits.domains}</div>
            </div>
          </div>

          {subscription?.current_period_end && (
            <div className="text-sm text-muted-foreground">
              Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
            </div>
          )}

          <div className="flex gap-2">
            {subscription?.status === "active" && (
              <Button variant="outline" onClick={handleManageSubscription}>
                Manage Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan Features */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
          <CardDescription>Features included in your current plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {planLimits.warmup ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-gray-400">✗</span>
              )}
              <span className={planLimits.warmup ? "" : "text-muted-foreground"}>
                Email Warmup
              </span>
            </div>
            <div className="flex items-center gap-2">
              {planLimits.experiments ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-gray-400">✗</span>
              )}
              <span className={planLimits.experiments ? "" : "text-muted-foreground"}>
                A/B Experiments
              </span>
            </div>
            <div className="flex items-center gap-2">
              {planLimits.analytics ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-gray-400">✗</span>
              )}
              <span className={planLimits.analytics ? "" : "text-muted-foreground"}>
                Analytics
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      {currentPlan !== "agency" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade Plan</CardTitle>
            <CardDescription>Choose a plan that fits your needs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {(["starter", "pro", "agency"] as PlanKey[])
                .filter((p) => {
                  // Only show plans higher than current
                  const planOrder: PlanKey[] = ["free", "starter", "pro", "agency"];
                  return planOrder.indexOf(p) > planOrder.indexOf(currentPlan);
                })
                .map((planKey) => {
                  const limits = PLANS[planKey];
                  const meta = PLAN_METADATA[planKey];
                  return (
                    <Card key={planKey} className="relative">
                      <CardHeader>
                        <CardTitle className="text-lg">{meta.name}</CardTitle>
                        <CardDescription className="text-2xl font-bold mt-2">
                          {meta.price}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm space-y-1">
                          <div>• {limits.seats} seat{limits.seats !== 1 ? "s" : ""}</div>
                          <div>• {limits.daily_sends.toLocaleString()} sends/day</div>
                          <div>
                            • {limits.max_leads ? `${limits.max_leads.toLocaleString()} leads` : "Leads included"}
                          </div>
                          {limits.warmup && <div>• Email Warmup</div>}
                          {limits.experiments && <div>• A/B Experiments</div>}
                          <div>• {limits.domains} domains</div>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => handleUpgrade(planKey)}
                          variant={planKey === "pro" ? "default" : "outline"}
                        >
                          Upgrade to {meta.name}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal({ ...upgradeModal, open })}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
        current={upgradeModal.current}
        limit={upgradeModal.limit}
      />
    </div>
  );
}
