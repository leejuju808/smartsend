"use client";

import { useDashboard } from "./hooks/useDashboard";
import { StatCard } from "./components/StatCard";
import { HotLeadsPanel } from "./components/HotLeadsPanel";
import { LatestRepliesPanel } from "./components/LatestRepliesPanel";
import { TasksTodayPanel } from "./components/TasksTodayPanel";
import { CampaignSnapshotPanel } from "./components/CampaignSnapshotPanel";
import { Skeleton } from "@/src/components/ui/skeleton";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Row Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-16 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="rounded-xl border p-6 bg-destructive/10 text-destructive">
          <p className="font-medium">Failed to load dashboard</p>
          <p className="text-sm mt-1">{error || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const formatDelta = (delta: number) => {
    if (delta === 0) return "No change";
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta} since yesterday`;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="HOT Leads"
          value={data.kpis.hotLeads.count}
          subtext={formatDelta(data.kpis.hotLeads.deltaSinceYesterday)}
          href="/contacts?status=hot"
        />
        <StatCard
          label="New Replies"
          value={data.kpis.newReplies.count}
          subtext={`${data.kpis.newReplies.totalOpen} total threads in inbox`}
          href="/inbox/replies"
        />
        <StatCard
          label="Tasks Due Today"
          value={data.kpis.tasksToday.count}
          subtext={data.kpis.tasksToday.overdue > 0 ? `${data.kpis.tasksToday.overdue} overdue` : "All on track"}
          href="/tasks?filter=today"
        />
        <StatCard
          label="Emails Sent (7d)"
          value={data.kpis.emailsSent7d.count}
          subtext={`Replies: ${data.kpis.emailsSent7d.replies}`}
          href="/campaigns"
        />
      </div>

      {/* Roofing Status Counters */}
      {data.roofingStatusCounts && (
        <div className="rounded-xl border p-6 bg-card">
          <h2 className="text-lg font-semibold mb-4">Lead Status Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{data.roofingStatusCounts.NEW}</div>
              <div className="text-sm text-muted-foreground">New</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{data.roofingStatusCounts.HOT}</div>
              <div className="text-sm text-muted-foreground">Hot</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{data.roofingStatusCounts.WARM}</div>
              <div className="text-sm text-muted-foreground">Warm</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.roofingStatusCounts.FOLLOW_UP}</div>
              <div className="text-sm text-muted-foreground">Follow Up</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{data.roofingStatusCounts.NOT_INTERESTED}</div>
              <div className="text-sm text-muted-foreground">Not Interested</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-black">{data.roofingStatusCounts.OUT_OF_SCOPE}</div>
              <div className="text-sm text-muted-foreground">Out of Scope</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <HotLeadsPanel hotLeads={data.hotLeads} />
          <LatestRepliesPanel latestReplies={data.latestReplies} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <TasksTodayPanel tasks={data.tasksToday} />
          <CampaignSnapshotPanel campaigns={data.campaigns} />
        </div>
      </div>
    </div>
  );
}
