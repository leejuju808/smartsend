// Block 87000 — SmartSend Phone Dashboard
// 24/7 phone receptionist dashboard for roofing companies

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import PhoneDashboardClient from "./PhoneDashboardClient";

export const metadata: Metadata = {
  title: "Phone Assistant · SmartSend",
  description: "24/7 phone receptionist that never misses a lead",
};

export default async function PhoneDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  // Fetch dashboard data
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let dashboardData;
  try {
    const response = await fetch(`${baseUrl}/api/phone/dashboard`, {
      cache: "no-store",
      headers: {
        Cookie: (await import("next/headers")).cookies().toString(),
      },
    });
    dashboardData = await response.json();
  } catch (error) {
    console.error("Error fetching phone dashboard:", error);
    dashboardData = {
      metrics: {
        missedCallsToday: 0,
        textBackConversions: 0,
        aiAnsweredCalls: 0,
        bookedInspections: 0,
        stormModeActive: false,
      },
      recentCalls: [],
    };
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Phone Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            24/7 phone receptionist that never misses a lead
          </p>
        </div>
        <a
          href="/phone/settings"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Settings
        </a>
      </header>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Missed Calls Today"
          value={dashboardData.metrics.missedCallsToday}
          description="Calls that went unanswered"
          trend={null}
        />
        <MetricCard
          title="Text-Back Conversions"
          value={dashboardData.metrics.textBackConversions}
          description="Missed calls that responded"
          trend={null}
        />
        <MetricCard
          title="AI Answered Calls"
          value={dashboardData.metrics.aiAnsweredCalls}
          description="Calls handled by AI"
          trend={null}
        />
        <MetricCard
          title="Booked Inspections"
          value={dashboardData.metrics.bookedInspections}
          description="From calls today"
          trend={null}
        />
      </div>

      {/* Storm Mode Banner */}
      {dashboardData.metrics.stormModeActive && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600 font-semibold">⚡ Storm Mode Active</span>
            <span className="text-sm text-yellow-700">
              AI is using storm-specific messaging to maximize conversions
            </span>
          </div>
        </div>
      )}

      {/* Call Logs Table */}
      <PhoneDashboardClient initialCalls={dashboardData.recentCalls} />
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  trend,
}: {
  title: string;
  value: number;
  description: string;
  trend: number | null;
}) {
  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend !== null && (
          <p className={`text-xs ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% from yesterday
          </p>
        )}
      </div>
    </div>
  );
}



























