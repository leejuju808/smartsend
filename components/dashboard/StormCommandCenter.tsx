"use client";

// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Storm Command Center Component

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";

interface StormEvent {
  id: string;
  storm_type: string;
  event_date: string;
  affected_zips: string[];
  severity: {
    rating?: number;
    hail_size?: number;
    wind_speed?: number;
    description?: string;
  };
  detected_at: string;
  is_active: boolean;
}

interface StormStats {
  storm_event: StormEvent | null;
  homeowners_notified: number;
  inspections_requested: number;
  inspections_completed: number;
  emergency_repairs: number;
  replacement_opportunities: number;
  revenue_potential: number;
}

interface InspectionRequest {
  id: string;
  name: string;
  address: string;
  zip_code: string;
  status: string;
  severity_rating: number | null;
  technician_id: string | null;
  created_at: string;
}

export function StormCommandCenter() {
  const [stats, setStats] = useState<StormStats | null>(null);
  const [inspectionQueue, setInspectionQueue] = useState<InspectionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStormData();
  }, []);

  const fetchStormData = async () => {
    try {
      setLoading(true);
      
      // Fetch active storm event
      const stormResponse = await fetch("/api/storm/active");
      const stormData = await stormResponse.json();
      
      if (stormData.storm_event) {
        // Fetch storm stats
        const statsResponse = await fetch(`/api/storm/stats?storm_id=${stormData.storm_event.id}`);
        const statsData = await statsResponse.json();
        
        // Fetch inspection queue
        const queueResponse = await fetch(`/api/storm/inspections?storm_id=${stormData.storm_event.id}`);
        const queueData = await queueResponse.json();
        
        setStats({
          storm_event: stormData.storm_event,
          ...statsData,
        });
        setInspectionQueue(queueData.inspections || []);
      } else {
        setStats({
          storm_event: null,
          homeowners_notified: 0,
          inspections_requested: 0,
          inspections_completed: 0,
          emergency_repairs: 0,
          replacement_opportunities: 0,
          revenue_potential: 0,
        });
      }
    } catch (error) {
      console.error("Failed to load storm data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6">
        <div className="text-sm text-gray-400">Loading storm command center…</div>
      </div>
    );
  }

  if (!stats?.storm_event) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6">
        <div className="text-sm text-gray-400">No active storm events</div>
      </div>
    );
  }

  const storm = stats.storm_event;
  const stormTypeLabel = {
    hail: "Hailstorm",
    wind: "High Wind",
    rain: "Severe Rain",
    ice: "Ice Storm",
    tree_impact: "Tree Impact",
  }[storm.storm_type] || storm.storm_type;

  return (
    <div className="rounded-xl bg-gradient-to-r from-red-500/20 via-orange-400/10 to-transparent border border-red-500/40 p-6 space-y-6">
      {/* Storm Overview Panel */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase text-red-300 tracking-wide font-semibold">
              🌩 Storm Command Center
            </div>
            <div className="text-sm text-gray-300 mt-1">
              {stormTypeLabel} detected on {format(new Date(storm.event_date), "MMM d, yyyy")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Severity</div>
            <div className="text-lg font-bold text-red-300">
              {storm.severity.rating || "N/A"}/10
            </div>
          </div>
        </div>

        {/* Affected Areas */}
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-2">Affected ZIP Codes</div>
          <div className="flex flex-wrap gap-2">
            {storm.affected_zips.slice(0, 10).map((zip) => (
              <span
                key={zip}
                className="px-2 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-200"
              >
                {zip}
              </span>
            ))}
            {storm.affected_zips.length > 10 && (
              <span className="px-2 py-1 text-xs text-gray-400">
                +{storm.affected_zips.length - 10} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Homeowners Notified"
          value={stats.homeowners_notified}
          icon="📧"
        />
        <StatCard
          label="Inspections Requested"
          value={stats.inspections_requested}
          icon="📋"
        />
        <StatCard
          label="Inspections Completed"
          value={stats.inspections_completed}
          icon="✅"
        />
        <StatCard
          label="Emergency Repairs"
          value={stats.emergency_repairs}
          icon="🔧"
        />
        <StatCard
          label="Replacement Opportunities"
          value={stats.replacement_opportunities}
          icon="🏠"
        />
        <StatCard
          label="Revenue Potential"
          value={`$${(stats.revenue_potential / 1000).toFixed(0)}k`}
          icon="💰"
          highlight
        />
      </div>

      {/* Live Inspection Queue */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase text-gray-300 tracking-wide font-semibold">
            Live Inspection Queue
          </div>
          <Link
            href="/storm/inspections"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            View All →
          </Link>
        </div>

        <div className="space-y-2">
          {inspectionQueue.slice(0, 5).map((inspection) => (
            <InspectionRow key={inspection.id} inspection={inspection} />
          ))}
          {inspectionQueue.length === 0 && (
            <div className="text-sm text-gray-400 py-4 text-center">
              No inspection requests yet
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-red-500/20">
        <button
          onClick={fetchStormData}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
        >
          Refresh Data
        </button>
        <Link
          href="/storm/inspections"
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition"
        >
          Manage Inspections
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "bg-yellow-500/10 border-yellow-500/40"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div
        className={`text-xl font-bold ${
          highlight ? "text-yellow-300" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function InspectionRow({ inspection }: { inspection: InspectionRequest }) {
  const statusColors = {
    open: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    assigned: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    in_progress: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    completed: "bg-green-500/20 text-green-300 border-green-500/40",
    cancelled: "bg-gray-500/20 text-gray-300 border-gray-500/40",
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{inspection.name}</div>
        <div className="text-xs text-gray-400 mt-1">
          {inspection.address} • {inspection.zip_code}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {inspection.severity_rating && (
          <div className="text-xs text-gray-400">
            Severity: <span className="text-red-300">{inspection.severity_rating}/10</span>
          </div>
        )}
        <span
          className={`px-2 py-1 rounded text-xs border ${
            statusColors[inspection.status as keyof typeof statusColors] ||
            statusColors.open
          }`}
        >
          {inspection.status}
        </span>
      </div>
    </div>
  );
}
































