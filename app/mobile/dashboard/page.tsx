"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, Zap, Calendar, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Screen 5 — My Dashboard (Simplified)
 * Shows only: Replies this week, HOT leads, Estimates booked, Estimated job value
 */
export default function MobileDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    repliesThisWeek: 0,
    hotLeadsThisWeek: 0,
    estimatesBooked: 0,
    estimatedJobValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get workspace
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      const workspaceId = workspace.workspace_id;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Replies this week
      const { count: repliesCount } = await supabase
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", weekAgo.toISOString());

      // HOT leads this week
      const { count: hotLeadsCount } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("lead_status", "hot")
        .gte("created_at", weekAgo.toISOString());

      // Estimates booked this week
      const { count: bookedCount } = await supabase
        .from("schedule_bookings")
        .select("*", { count: "exact", head: true })
        .eq("status", "booked")
        .gte("created_at", weekAgo.toISOString());

      // Estimated job value (sum of est_job_value for HOT leads)
      const { data: hotLeads } = await supabase
        .from("contacts")
        .select("est_job_value")
        .eq("lead_status", "hot")
        .gte("created_at", weekAgo.toISOString());

      const totalValue = (hotLeads || [])
        .reduce((sum, lead) => sum + (Number(lead.est_job_value) || 0), 0);

      setStats({
        repliesThisWeek: repliesCount || 0,
        hotLeadsThisWeek: hotLeadsCount || 0,
        estimatesBooked: bookedCount || 0,
        estimatedJobValue: totalValue,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      id: "replies",
      label: "Replies This Week",
      value: stats.repliesThisWeek,
      icon: MessageSquare,
      color: "bg-blue-500",
      href: "/mobile/inbox",
    },
    {
      id: "hot",
      label: "HOT Leads This Week",
      value: stats.hotLeadsThisWeek,
      icon: Zap,
      color: "bg-red-500",
      href: "/mobile/inbox",
    },
    {
      id: "booked",
      label: "Estimates Booked",
      value: stats.estimatesBooked,
      icon: Calendar,
      color: "bg-green-500",
      href: "/mobile/book",
    },
    {
      id: "value",
      label: "Estimated Job Value",
      value: `$${stats.estimatedJobValue.toLocaleString()}`,
      icon: DollarSign,
      color: "bg-purple-500",
      href: null,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/mobile")}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-xs text-gray-600">This week&apos;s stats</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4">
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading stats...</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              const CardContent = (
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className={`${card.color} p-2 rounded-lg w-fit mb-3`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {card.value}
                  </div>
                  <div className="text-xs text-gray-600">{card.label}</div>
                </div>
              );

              if (card.href) {
                return (
                  <button
                    key={card.id}
                    onClick={() => router.push(card.href!)}
                    className="text-left"
                  >
                    {CardContent}
                  </button>
                );
              }

              return <div key={card.id}>{CardContent}</div>;
            })}
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-green-900 mb-1">
            SmartSend is working! 🎉
          </div>
          <div className="text-xs text-green-700">
            You&apos;re seeing SmartSend in action. Check your inbox to respond to HOT leads and book more estimates.
          </div>
        </div>
      </div>
    </div>
  );
}






































