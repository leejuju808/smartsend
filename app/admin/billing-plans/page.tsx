"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/Badge";

type BillingPlan = {
  plan_key: string;
  stripe_price_id: string | null;
  seat_limit: number;
  daily_send_cap: number;
  monthly_send_cap: number;
  monthly_reply_cap: number;
  updated_at: string;
};

export default function BillingPlansAdminPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/billing-plans");
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load plans");
          setPlans([]);
          return;
        }
        setPlans(json.plans || []);
      } catch (err) {
        console.error("load plans error", err);
        setError("Failed to load plans");
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleFieldChange = (
    planKey: string,
    field: keyof BillingPlan,
    value: string
  ) => {
    setPlans((prev) =>
      prev.map((p) =>
        p.plan_key === planKey
          ? {
              ...p,
              [field]:
                field === "stripe_price_id"
                  ? value
                  : Number.isNaN(Number(value))
                  ? 0
                  : Number(value),
            }
          : p
      )
    );
  };

  const savePlan = async (plan: BillingPlan) => {
    setSavingKey(plan.plan_key);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/billing-plans/${encodeURIComponent(plan.plan_key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seat_limit: plan.seat_limit,
            daily_send_cap: plan.daily_send_cap,
            monthly_send_cap: plan.monthly_send_cap,
            monthly_reply_cap: plan.monthly_reply_cap,
            stripe_price_id: plan.stripe_price_id,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        console.error("save plan error", json);
        setError(json.error || "Failed to save plan");
        return;
      }

      // Sync updated plan row back into state
      setPlans((prev) =>
        prev.map((p) =>
          p.plan_key === plan.plan_key ? { ...p, ...json.plan } : p
        )
      );
    } catch (err) {
      console.error("save plan error", err);
      setError("Failed to save plan");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-xs text-muted-foreground">
        Loading billing plans…
      </div>
    );
  }

  if (error === "not_admin") {
    return (
      <div className="p-6 text-xs text-red-300">
        You are not authorized to view this page.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Billing Plans (Admin)</h1>
          <p className="text-xs text-muted-foreground">
            Internal controls for Free / Starter / Pro caps. Updating these
            values takes effect immediately for all workspaces on that plan.
          </p>
        </div>
        <Badge className="bg-slate-900 border-slate-700 text-[10px]">
          Admin only
        </Badge>
      </div>

      {error && (
        <Card className="border border-red-700/70 bg-red-950/60">
          <CardContent className="p-3 text-[11px] text-red-50">
            {error}
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-950/80 border-slate-800">
        <CardContent className="p-3">
          <div className="overflow-x-auto text-[11px]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-1 pr-2">Plan</th>
                  <th className="py-1 pr-2">Stripe price ID</th>
                  <th className="py-1 pr-2 text-right">Seats</th>
                  <th className="py-1 pr-2 text-right">Daily sends</th>
                  <th className="py-1 pr-2 text-right">30d sends</th>
                  <th className="py-1 pr-2 text-right">30d replies</th>
                  <th className="py-1 pr-2 text-right">Updated</th>
                  <th className="py-1 pr-2 text-right">Save</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr
                    key={p.plan_key}
                    className="border-b border-slate-900/80 last:border-b-0"
                  >
                    <td className="py-1 pr-2 align-top capitalize">
                      <div className="font-semibold">{p.plan_key}</div>
                    </td>
                    <td className="py-1 pr-2 align-top">
                      <Input
                        className="h-7 text-[11px]"
                        value={p.stripe_price_id ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            p.plan_key,
                            "stripe_price_id",
                            e.target.value
                          )
                        }
                        placeholder="price_..."
                      />
                    </td>
                    <td className="py-1 pr-2 align-top text-right">
                      <Input
                        className="h-7 w-24 text-right text-[11px]"
                        type="number"
                        value={p.seat_limit}
                        onChange={(e) =>
                          handleFieldChange(
                            p.plan_key,
                            "seat_limit",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="py-1 pr-2 align-top text-right">
                      <Input
                        className="h-7 w-24 text-right text-[11px]"
                        type="number"
                        value={p.daily_send_cap}
                        onChange={(e) =>
                          handleFieldChange(
                            p.plan_key,
                            "daily_send_cap",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="py-1 pr-2 align-top text-right">
                      <Input
                        className="h-7 w-28 text-right text-[11px]"
                        type="number"
                        value={p.monthly_send_cap}
                        onChange={(e) =>
                          handleFieldChange(
                            p.plan_key,
                            "monthly_send_cap",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="py-1 pr-2 align-top text-right">
                      <Input
                        className="h-7 w-28 text-right text-[11px]"
                        type="number"
                        value={p.monthly_reply_cap}
                        onChange={(e) =>
                          handleFieldChange(
                            p.plan_key,
                            "monthly_reply_cap",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="py-1 pr-2 align-top text-right text-[10px] text-muted-foreground">
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1 pr-2 align-top text-right">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={() => savePlan(p)}
                        disabled={savingKey === p.plan_key}
                      >
                        {savingKey === p.plan_key ? "Saving…" : "Save"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}




