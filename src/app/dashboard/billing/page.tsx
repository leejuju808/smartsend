"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClientComponentClient } from "@/lib/supabase";

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [usage, setUsage] = useState({ leads: 0, sends: 0, seats: 1 });
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get user email
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }

        // Get team ID from localStorage or API
        const savedTeamId = localStorage.getItem("activeTeamId");
        if (savedTeamId) {
          setTeamId(savedTeamId);
        } else {
          // Fetch teams and use first one
          const res = await fetch("/api/teams/list");
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            const firstTeamId = data.items[0].id;
            setTeamId(firstTeamId);
            localStorage.setItem("activeTeamId", firstTeamId);
          }
        }

        // Load team plan and usage if teamId is available
        if (teamId || savedTeamId) {
          const tId = teamId || savedTeamId;
          const { data: team } = await supabase
            .from("teams")
            .select("plan, usage_leads, usage_sends, usage_seats")
            .eq("id", tId)
            .single();

          if (team) {
            setCurrentPlan(team.plan || "free");
            setUsage({
              leads: team.usage_leads || 0,
              sends: team.usage_sends || 0,
              seats: team.usage_seats || 1,
            });
          }
        }
      } catch (error) {
        console.error("Error loading billing data:", error);
      }
    };

    loadData();
  }, [supabase, teamId]);

  async function upgrade(plan: string, priceId: string) {
    if (!teamId || !userEmail) {
      alert("Please wait for team data to load");
      return;
    }

    setLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/createCheckoutSession`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          teamId,
          priceId,
          email: userEmail,
          plan,
          successUrl: `${window.location.origin}/dashboard/billing?success=1`,
          cancelUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      alert(error.message || "Failed to start checkout");
      setLoading(false);
    }
  }

  // Check for success param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      alert("Subscription activated! Your plan has been updated.");
      // Reload team data
      if (teamId) {
        supabase
          .from("teams")
          .select("plan, usage_leads, usage_sends, usage_seats")
          .eq("id", teamId)
          .single()
          .then(({ data: team }) => {
            if (team) {
              setCurrentPlan(team.plan || "free");
              setUsage({
                leads: team.usage_leads || 0,
                sends: team.usage_sends || 0,
                seats: team.usage_seats || 1,
              });
            }
          });
      }
    }
  }, [teamId, supabase]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage your subscription and upgrade your plan to unlock more features
        </p>
      </div>

      {currentPlan && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm">
            <strong>Current Plan:</strong> {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Usage: {usage.leads} leads, {usage.sends} sends, {usage.seats} seats
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-xl font-semibold">Free</div>
            <div className="text-3xl font-bold">$0</div>
            <p className="text-sm text-muted-foreground">Up to 500 leads</p>
            <p className="text-sm text-muted-foreground">200 sends/month</p>
            <p className="text-sm text-muted-foreground">1 seat</p>
            <Button variant="outline" disabled>
              {currentPlan === "free" ? "Current Plan" : "Downgrade"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-xl font-semibold">Pro</div>
            <div className="text-3xl font-bold">$49</div>
            <div className="text-sm text-muted-foreground">/month</div>
            <p className="text-sm text-muted-foreground">5,000 leads</p>
            <p className="text-sm text-muted-foreground">10,000 sends/month</p>
            <p className="text-sm text-muted-foreground">3 seats</p>
            <Button
              onClick={() => upgrade("pro", process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "price_123")}
              disabled={loading || currentPlan === "pro"}
              className="w-full"
            >
              {currentPlan === "pro" ? "Current Plan" : "Upgrade → $49/mo"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Replace price_123 with your actual Stripe Pro price ID
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-xl font-semibold">Agency</div>
            <div className="text-3xl font-bold">$199</div>
            <div className="text-sm text-muted-foreground">/month</div>
            <p className="text-sm text-muted-foreground">50,000 leads</p>
            <p className="text-sm text-muted-foreground">High sending limits</p>
            <p className="text-sm text-muted-foreground">Seats included</p>
            <Button
              onClick={() => upgrade("agency", process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY || "price_456")}
              disabled={loading || currentPlan === "agency"}
              className="w-full"
            >
              {currentPlan === "agency" ? "Current Plan" : "Upgrade → $199/mo"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Replace price_456 with your actual Stripe Agency price ID
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm font-semibold mb-2">⚠️ Configuration Required</p>
        <p className="text-xs text-muted-foreground">
          Set environment variables <code>NEXT_PUBLIC_STRIPE_PRICE_PRO</code> and{" "}
          <code>NEXT_PUBLIC_STRIPE_PRICE_AGENCY</code> with your actual Stripe price IDs before going live.
        </p>
      </div>
    </div>
  );
}
