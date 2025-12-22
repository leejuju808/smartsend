"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, CheckCircle, Clock } from "lucide-react";

export function ChangeOrderMetrics() {
  const supabase = createClientComponentClient();
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    approvalRate: 0,
    pendingCount: 0,
    approvedCount: 0,
    averageValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      // Get current team
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!teamMember) {
        setLoading(false);
        return;
      }

      // Get all change orders for jobs in this team
      const { data: changeOrders, error } = await supabase
        .from("change_orders")
        .select(`
          id,
          amount,
          status,
          jobs!inner (
            id,
            team_id
          )
        `)
        .eq("jobs.team_id", teamMember.team_id);

      if (error) throw error;

      const approved = changeOrders?.filter(co => co.status === "approved") || [];
      const pending = changeOrders?.filter(co => co.status === "pending") || [];
      const totalRevenue = approved.reduce((sum, co) => sum + Number(co.amount), 0);
      const approvalRate = changeOrders && changeOrders.length > 0
        ? (approved.length / changeOrders.length) * 100
        : 0;
      const averageValue = approved.length > 0
        ? totalRevenue / approved.length
        : 0;

      setMetrics({
        totalRevenue,
        approvalRate,
        pendingCount: pending.length,
        approvedCount: approved.length,
        averageValue,
      });
    } catch (error) {
      console.error("Error loading change order metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="p-4">Loading metrics...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Order Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total Added Revenue
            </div>
            <div className="text-2xl font-bold text-green-500">
              ${metrics.totalRevenue.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Approval Rate
            </div>
            <div className="text-2xl font-bold">
              {metrics.approvalRate.toFixed(1)}%
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Pending
            </div>
            <div className="text-2xl font-bold text-yellow-500">
              {metrics.pendingCount}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              Average Value
            </div>
            <div className="text-2xl font-bold">
              ${metrics.averageValue.toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
































