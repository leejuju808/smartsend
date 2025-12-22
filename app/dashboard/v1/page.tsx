import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { getAccountRole } from "@/lib/auth/requireAccountRole";
import {
  RepliesTodayCard,
  HotLeadsCard,
  TasksDueCard,
  EstimatedRevenueCard,
  UpcomingAppointmentsCard,
  CampaignActivityCard,
} from "@/components/dashboard/DashboardKPICard";
import {
  RepliesTrendChart,
  RevenueTrendChart,
  HotLeadsTrendChart,
} from "@/components/dashboard/DashboardCharts";
import { RecentActivity } from "@/components/dashboard/DashboardActivity";
import { AttentionLeads } from "@/components/dashboard/DashboardAttentionLeads";
import { DashboardActions } from "@/components/dashboard/DashboardActions";
import { Metadata } from "next";
import { DashboardV1Response } from "@/app/api/dashboard/v1/route";

export const metadata: Metadata = {
  title: "Dashboard · SmartSend",
};

// Server-side function to fetch dashboard data
async function getDashboardData(workspaceId: string): Promise<DashboardV1Response> {
  // Import the route handler logic directly
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }

  const userId = user.id;
  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0));
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(todayStart.getTime() + 48 * 60 * 60 * 1000);

  // Use the same logic as the API route
  // For now, call the API route via internal fetch
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000";
  
  try {
    const response = await fetch(`${baseUrl}/api/dashboard/v1`, {
      headers: {
        // Pass auth cookie if available
        Cookie: (await import("next/headers")).cookies().toString(),
      },
      cache: "no-store",
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch dashboard data");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Dashboard fetch error:", error);
    // Return empty/default data on error
    return {
      repliesToday: { count: 0, deltaVsYesterday: 0 },
      hotLeads: { count: 0, deltaVsYesterday: 0 },
      tasksDue: { count: 0, overdue: 0 },
      estimatedRevenue: { total: 0, deltaThisWeek: 0 },
      appointments: { count: 0, today: 0, tomorrow: 0 },
      campaignActivity: null,
      replyTrend: [],
      revenueTrend: [],
      hotLeadsTrend: [],
      recentActivity: [],
      attentionLeads: [],
    };
  }
}

export default async function DashboardV1Page() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  // Get user role for personalization
  const roleData = await getAccountRole();
  const userRole = roleData?.role || "staff";

  // Fetch dashboard data
  const dashboardData = await getDashboardData(workspaceId);


  // Role-based visibility
  const canViewRevenue = userRole === "owner" || userRole === "manager";
  const canViewCampaigns = userRole === "owner" || userRole === "manager";
  const canViewAllLeads = userRole === "owner" || userRole === "manager";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header with Actions */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            SmartSend Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Your contractor control center — see leads, revenue, and activity at a glance.
          </p>
        </div>
        <DashboardActions />
      </header>

      {/* 6 Core KPI Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <RepliesTodayCard
          count={dashboardData.repliesToday.count}
          delta={dashboardData.repliesToday.deltaVsYesterday}
        />
        <HotLeadsCard
          count={dashboardData.hotLeads.count}
          delta={dashboardData.hotLeads.deltaVsYesterday}
        />
        <TasksDueCard
          count={dashboardData.tasksDue.count}
          overdue={dashboardData.tasksDue.overdue}
        />
        {canViewRevenue && (
          <EstimatedRevenueCard
            total={dashboardData.estimatedRevenue.total}
            delta={dashboardData.estimatedRevenue.deltaThisWeek}
          />
        )}
        <UpcomingAppointmentsCard
          today={dashboardData.appointments.today}
          tomorrow={dashboardData.appointments.tomorrow}
        />
        {canViewCampaigns && dashboardData.campaignActivity && (
          <CampaignActivityCard
            campaignName={dashboardData.campaignActivity.campaignName}
            emailsSent={dashboardData.campaignActivity.emailsSentToday}
            openRate={dashboardData.campaignActivity.openRate}
            replies={dashboardData.campaignActivity.replies}
          />
        )}
      </div>

      {/* Dashboard Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RepliesTrendChart data={dashboardData.replyTrend} />
        {canViewRevenue && (
          <RevenueTrendChart data={dashboardData.revenueTrend} />
        )}
      </div>

      {canViewCampaigns && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HotLeadsTrendChart data={dashboardData.hotLeadsTrend} />
        </div>
      )}

      {/* Bottom Half: Activity Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity activities={dashboardData.recentActivity} />
        {canViewAllLeads && (
          <AttentionLeads leads={dashboardData.attentionLeads} />
        )}
      </div>
    </div>
  );
}

