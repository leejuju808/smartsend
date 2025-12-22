// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// Dashboard Page: Reactivation Engine

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { Button } from "@/components/ui/button";
import { Users, Calendar, MessageSquare, DollarSign, RefreshCw, Send } from "lucide-react";

interface ReactivationStats {
  past_customers_count: number;
  events_scheduled: number;
  events_sent: number;
  events_replied: number;
  events_booked: number;
  estimated_revenue: number;
}

interface PastCustomer {
  id: string;
  homeowner_name: string;
  email: string;
  phone: string;
  job_completed_at: string;
  roof_type: string;
  job_value: number;
  reactivation_events: ReactivationEvent[];
}

interface ReactivationEvent {
  id: string;
  type: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  replied_at: string | null;
  booked_at: string | null;
}

export default function ReactivationDashboardPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [stats, setStats] = useState<ReactivationStats | null>(null);
  const [customers, setCustomers] = useState<PastCustomer[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      const wid = await getActiveWorkspaceId();
      setWorkspaceId(wid);
    }
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadData();
    }
  }, [workspaceId]);

  async function loadData() {
    if (!workspaceId) return;

    setLoading(true);
    try {
      // Load stats
      const statsRes = await fetch(`/api/reactivation/stats?workspace_id=${workspaceId}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Load customers
      const customersRes = await fetch(`/api/reactivation/customers?workspace_id=${workspaceId}&limit=20`);
      if (customersRes.ok) {
        const customersData = await customersRes.json();
        setCustomers(customersData.customers || []);
      }

      // Load events
      const eventsRes = await fetch(`/api/reactivation/events?workspace_id=${workspaceId}&status=scheduled&limit=20`);
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events || []);
      }
    } catch (error) {
      console.error("Error loading reactivation data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEvents() {
    if (!workspaceId) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/reactivation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Generated ${data.events_created} reactivation events from ${data.customers_processed} customers`);
        loadData();
      } else {
        alert("Failed to generate events");
      }
    } catch (error) {
      console.error("Error generating events:", error);
      alert("Failed to generate events");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendMessage(eventId: string) {
    if (!workspaceId) return;

    setSending(eventId);
    try {
      const res = await fetch("/api/reactivation/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          workspace_id: workspaceId,
        }),
      });

      if (res.ok) {
        alert("Reactivation message sent successfully");
        loadData();
      } else {
        alert("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message");
    } finally {
      setSending(null);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getEventTypeLabel(type: string) {
    const labels: Record<string, string> = {
      "3m": "3-Month Follow-up",
      "1y": "1-Year Check-in",
      "3y": "3-Year Offer",
      "5y": "5-Year Offer",
      "7y": "7-Year Alert",
      "10y": "10-Year Alert",
      "seasonal": "Seasonal Offer",
    };
    return labels[type] || type;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading reactivation data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Past Customer Reactivation Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Wake up dead files • Auto-detect old customers • Generate repeat revenue
          </p>
        </div>
        <Button
          onClick={handleGenerateEvents}
          disabled={generating || !workspaceId}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generating..." : "Generate Events"}
        </Button>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Past Customers"
          value={stats?.past_customers_count || 0}
          icon={<Users className="h-5 w-5" />}
          color="blue"
        />
        <KPICard
          title="Events Scheduled"
          value={stats?.events_scheduled || 0}
          icon={<Calendar className="h-5 w-5" />}
          color="orange"
        />
        <KPICard
          title="Messages Sent"
          value={stats?.events_sent || 0}
          icon={<MessageSquare className="h-5 w-5" />}
          color="green"
        />
        <KPICard
          title="Replies Received"
          value={stats?.events_replied || 0}
          icon={<MessageSquare className="h-5 w-5" />}
          color="purple"
        />
        <KPICard
          title="Estimated Revenue"
          value={`$${Number(stats?.estimated_revenue || 0).toLocaleString()}`}
          icon={<DollarSign className="h-5 w-5" />}
          color="green"
        />
      </div>

      {/* Scheduled Events Table */}
      <section className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Scheduled Reactivation Events</h2>
          <p className="text-sm text-muted-foreground">
            Events ready to send to past customers
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Scheduled</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No scheduled events. Click "Generate Events" to create reactivation events.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {event.past_customers?.homeowner_name || "Unknown"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {event.past_customers?.email || event.past_customers?.phone || "No contact"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        {getEventTypeLabel(event.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(event.scheduled_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          event.status === "sent"
                            ? "bg-green-100 text-green-800"
                            : event.status === "replied"
                            ? "bg-purple-100 text-purple-800"
                            : event.status === "booked"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {event.status === "scheduled" && (
                        <Button
                          size="sm"
                          onClick={() => handleSendMessage(event.id)}
                          disabled={sending === event.id}
                          className="flex items-center gap-2"
                        >
                          <Send className="h-3 w-3" />
                          {sending === event.id ? "Sending..." : "Send Now"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Past Customers Table */}
      <section className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Past Customers</h2>
          <p className="text-sm text-muted-foreground">
            Customers from completed jobs available for reactivation
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Job Completed</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Roof Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Job Value</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No past customers found. Past customers are automatically created when jobs are marked as completed.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{customer.homeowner_name || "Unknown"}</div>
                      <div className="text-sm text-muted-foreground">
                        {customer.email || customer.phone || "No contact"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(customer.job_completed_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {customer.roof_type || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      ${Number(customer.job_value || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {customer.reactivation_events?.length > 0 ? (
                          customer.reactivation_events.map((event: ReactivationEvent) => (
                            <span
                              key={event.id}
                              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                            >
                              {getEventTypeLabel(event.type)} - {event.status}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No events</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon,
  color = "blue",
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: "blue" | "orange" | "green" | "purple" | "red";
}) {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    green: "bg-green-50 border-green-200 text-green-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };

  const iconColorClasses = {
    blue: "text-blue-600",
    orange: "text-orange-600",
    green: "text-green-600",
    purple: "text-purple-600",
    red: "text-red-600",
  };

  return (
    <div className={`rounded-lg border-2 p-6 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <div className={`p-3 rounded-lg bg-white ${iconColorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}


































