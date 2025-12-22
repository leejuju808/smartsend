// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// Call Dashboard Page
// Shows call analytics, missed call recovery, and call logs

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CallStats = {
  totalCalls: number;
  missedCalls: number;
  answeredCalls: number;
  voicemails: number;
  recoveryRate: number;
  answerRate: number;
  leadsCreated: number;
  emergencyLeads: number;
  stormCalls: number;
};

type CallLog = {
  id: string;
  phone: string;
  event: string;
  duration: number | null;
  voicemail_url: string | null;
  created_at: string;
  intent: string | null;
  confidence: number | null;
  reply_text: string | null;
  lead_id: string | null;
};

export default function CallsDashboardPage() {
  const [stats, setStats] = useState<CallStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/calls/analytics?days=${days}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
          setRecentCalls(data.recentCalls || []);
        }
      } catch (error) {
        console.error("Error loading call analytics:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [days]);

  if (loading || !stats) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading call analytics…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Analytics</h1>
          <p className="text-sm text-gray-600 mt-1">
            Every missed call becomes a lead • Auto-text back in 3 seconds
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                days === d
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Last {d} days
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Missed Calls Today"
          value={stats.missedCalls}
          subtitle={`${stats.totalCalls} total calls`}
          color="red"
        />
        <StatCard
          label="Missed Call Recovery Rate"
          value={`${stats.recoveryRate}%`}
          subtitle={`${stats.leadsCreated} leads created`}
          color="emerald"
        />
        <StatCard
          label="Answer Rate"
          value={`${stats.answerRate}%`}
          subtitle={`${stats.answeredCalls} answered`}
          color="blue"
        />
        <StatCard
          label="Emergency Leads"
          value={stats.emergencyLeads}
          subtitle={`${stats.stormCalls} storm calls`}
          color="orange"
        />
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Jobs Won From Calls"
          value="—"
          subtitle="Coming soon"
          color="gray"
        />
        <StatCard
          label="Revenue From Calls"
          value="—"
          subtitle="Coming soon"
          color="gray"
        />
        <StatCard
          label="Voicemails"
          value={stats.voicemails}
          subtitle="Left by callers"
          color="purple"
        />
      </div>

      {/* Call Log Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h2 className="font-semibold">Call Logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Caller Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Event
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Intent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Lead
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No calls logged yet
                  </td>
                </tr>
              ) : (
                recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{call.phone}</td>
                    <td className="px-4 py-3">
                      <EventBadge event={call.event} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {call.duration ? `${call.duration}s` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {call.intent ? (
                        <IntentBadge intent={call.intent} confidence={call.confidence} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {call.lead_id ? (
                        <Link
                          href={`/dashboard/leads/${call.lead_id}`}
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          View Lead
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(call.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  color: "red" | "emerald" | "blue" | "orange" | "purple" | "gray";
}) {
  const colorClasses = {
    red: "border-red-200 bg-red-50",
    emerald: "border-emerald-200 bg-emerald-50",
    blue: "border-blue-200 bg-blue-50",
    orange: "border-orange-200 bg-orange-50",
    purple: "border-purple-200 bg-purple-50",
    gray: "border-gray-200 bg-gray-50",
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    missed: "bg-red-100 text-red-800",
    answered: "bg-emerald-100 text-emerald-800",
    completed: "bg-blue-100 text-blue-800",
    voicemail: "bg-purple-100 text-purple-800",
    incoming: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded ${
        colors[event] || colors.incoming
      }`}
    >
      {event}
    </span>
  );
}

function IntentBadge({
  intent,
  confidence,
}: {
  intent: string;
  confidence: number | null;
}) {
  const labels: Record<string, string> = {
    emergency_leak: "Emergency Leak",
    repair_request: "Repair",
    full_replacement: "Full Replacement",
    storm_damage: "Storm Damage",
    general_question: "General Question",
  };

  const colors: Record<string, string> = {
    emergency_leak: "bg-red-100 text-red-800",
    repair_request: "bg-blue-100 text-blue-800",
    full_replacement: "bg-emerald-100 text-emerald-800",
    storm_damage: "bg-orange-100 text-orange-800",
    general_question: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="flex items-center gap-1">
      <span
        className={`px-2 py-1 text-xs font-medium rounded ${
          colors[intent] || colors.general_question
        }`}
      >
        {labels[intent] || intent}
      </span>
      {confidence !== null && (
        <span className="text-xs text-gray-500">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}


































