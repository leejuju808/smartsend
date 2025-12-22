"use client";

import { useEffect, useState } from "react";
import { PlanCard } from "@/components/billing/PlanCard";
import { SeatUsageCard } from "@/components/billing/SeatUsageCard";
import { CreditsCard } from "@/components/billing/CreditsCard";
import { UsageChart } from "@/components/billing/UsageChart";
import { BillingEventsFeed } from "@/components/billing/BillingEventsFeed";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClientComponentClient } from "@supabase/ssr";

export default function BillingOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const load = async () => {
      // Get workspace_id
      let wsId = workspaceId;
      if (!wsId) {
        // Try localStorage
        const wsFromStorage =
          typeof window !== "undefined"
            ? localStorage.getItem("active_workspace")
            : null;

        if (wsFromStorage) {
          wsId = wsFromStorage;
        } else {
          // Get user's first workspace
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle();

            if (data) {
              wsId = data.workspace_id;
            }
          }
        }
      }

      if (!wsId) {
        setLoading(false);
        return;
      }

      setWorkspaceId(wsId);

      // Fetch overview data
      try {
        const res = await fetch("/api/billing/overview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: wsId }),
        });
        const json = await res.json();
        if (res.ok) {
          setData(json);
        }
      } catch (error) {
        console.error("Failed to load overview:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading billing overview...</div>
      </div>
    );
  }

  if (!data || !workspaceId) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: Unable to load billing data.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Billing Overview</h1>
        <UpgradeButton workspaceId={workspaceId} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PlanCard plan={data.workspace?.plan || "free"} caps={data.workspace || {}} />
        <SeatUsageCard
          seatsUsed={data.guard?.seats_used || 0}
          seatLimit={data.workspace?.seat_limit || 1}
        />
        <CreditsCard credits={data.credits || 0} workspaceId={workspaceId} />
      </div>

      <UsageChart workspaceId={workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle>Billing Events</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingEventsFeed workspaceId={workspaceId} />
        </CardContent>
      </Card>
    </div>
  );
}

