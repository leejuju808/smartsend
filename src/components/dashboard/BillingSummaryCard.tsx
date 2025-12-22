"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface BillingSummary {
  plan_name: string | null;
  status: string | null;
  period_end: string | null;
  usage_soft_cap: number | null;
  emails_sent_today: number;
}

export function BillingSummaryCard() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function loadSummary() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("v_billing_summary")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading billing summary:", error);
        }

        setSummary(data || {
          plan_name: "Free",
          status: "trialing",
          period_end: null,
          usage_soft_cap: 1000,
          emails_sent_today: 0,
        });
      } catch (error) {
        console.error("Failed to load billing summary:", error);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, [supabase]);

  function handleManagePlan() {
    window.open("/billing/manage", "_blank");
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm">Loading billing info...</div>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="font-semibold text-lg">Billing</div>
      <div className="text-sm">Plan: {summary.plan_name || "Free"}</div>
      <div className="text-sm">Status: {summary.status || "trialing"}</div>
      {summary.period_end && (
        <div className="text-sm">
          Next renewal: {new Date(summary.period_end).toLocaleDateString()}
        </div>
      )}
      <div className="text-sm">
        Usage: {summary.emails_sent_today}/{summary.usage_soft_cap || 1000} emails today
      </div>
      <div className="w-full h-2 bg-muted rounded overflow-hidden">
        <div 
          className="h-2 bg-primary rounded transition-all" 
          style={{ width: `${Math.min(100, (summary.emails_sent_today / (summary.usage_soft_cap || 1000)) * 100)}%` }} 
        />
      </div>
      <Button size="sm" onClick={handleManagePlan}>
        Manage Plan
      </Button>
    </Card>
  );
}
