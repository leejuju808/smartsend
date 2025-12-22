"use client";

// Block 87000 — Phone Dashboard Client Component
// Interactive call logs table with real-time updates

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatPhoneNumber } from "@/lib/phone-utils";

interface Call {
  id: string;
  from_number: string;
  to_number: string;
  call_status: string;
  started_at: string;
  duration_seconds: number | null;
  ai_summary: string | null;
  lead_id: string | null;
  leads: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export default function PhoneDashboardClient({
  initialCalls,
}: {
  initialCalls: Call[];
}) {
  const [calls, setCalls] = useState<Call[]>(initialCalls);
  const [loading, setLoading] = useState(false);

  // Refresh calls every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/phone/dashboard");
        const data = await response.json();
        setCalls(data.recentCalls || []);
      } catch (error) {
        console.error("Error refreshing calls:", error);
      } finally {
        setLoading(false);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      answered: { label: "Answered", className: "bg-green-100 text-green-800" },
      missed: { label: "Missed", className: "bg-red-100 text-red-800" },
      no_answer: { label: "No Answer", className: "bg-red-100 text-red-800" },
      ai_answered: { label: "AI Answered", className: "bg-blue-100 text-blue-800" },
      voicemail: { label: "Voicemail", className: "bg-yellow-100 text-yellow-800" },
      busy: { label: "Busy", className: "bg-gray-100 text-gray-800" },
      failed: { label: "Failed", className: "bg-gray-100 text-gray-800" },
    };

    const config = statusConfig[status] || {
      label: status,
      className: "bg-gray-100 text-gray-800",
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}
      >
        {config.label}
      </span>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-card border rounded-lg">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Recent Calls</h2>
        {loading && (
          <p className="text-sm text-muted-foreground mt-1">Refreshing...</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Caller
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Summary
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Lead
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No calls yet. Calls will appear here as they come in.
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr key={call.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatPhoneNumber(call.from_number)}
                      </span>
                      {call.leads && (
                        <span className="text-xs text-muted-foreground">
                          {call.leads.first_name} {call.leads.last_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(call.call_status)}</td>
                  <td className="px-4 py-3 text-sm">
                    {formatDuration(call.duration_seconds)}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatDate(call.started_at)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                    {call.ai_summary || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {call.lead_id ? (
                      <Link
                        href={`/leads/${call.lead_id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        View Lead
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/phone/calls/${call.id}`}
                      className="text-primary hover:underline text-sm"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



























