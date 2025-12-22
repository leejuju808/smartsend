"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock, MessageSquare, TrendingUp } from "lucide-react";

type Thread = {
  id: string;
  leadId: string;
  lead: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    status?: string;
  } | null;
  lastMessage: string;
  summary: string | null;
  intent: string | null;
  urgency: "urgent" | "normal";
  status: string;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
};

type DashboardStats = {
  totalThreads: number;
  unreadMessages: number;
  urgentThreads: number;
  threadsNeedingAction: number;
  averageResponseTimeHours: number;
  averageResponseTimeMinutes: number;
  intentBreakdown: Record<string, number>;
};

const INTENT_LABELS: Record<string, string> = {
  booking_request: "Booking",
  price_question: "Price",
  warranty_claim: "Warranty",
  leak_emergency: "🚨 Leak/Emergency",
  schedule_change: "Reschedule",
  financing_question: "Financing",
  ready_to_move_forward: "Ready to Proceed",
  send_proposal_again: "Resend Proposal",
  complaint: "Complaint",
  referral: "Referral",
  not_interested: "Not Interested",
  material_question: "Materials",
  unknown: "Unknown",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "unread", label: "Unread" },
  { key: "booking_request", label: "Booking Requests" },
  { key: "price_question", label: "Price Questions" },
  { key: "leak_emergency", label: "Emergencies" },
  { key: "ready_to_move_forward", label: "Ready to Proceed" },
  { key: "complaint", label: "Complaints" },
];

export default function InboxCommandCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [filter, setFilter] = useState(searchParams.get("filter") || "all");
  const [search, setSearch] = useState(searchParams.get("search") || "");

  useEffect(() => {
    fetchThreads();
    fetchDashboardStats();
  }, [filter, search]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/inbox/threads?${params}`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error("Error fetching threads:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch("/api/inbox/dashboard");
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    router.push(`/dashboard/inbox-command-center?filter=${newFilter}${search ? `&search=${search}` : ""}`);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    router.push(`/dashboard/inbox-command-center?filter=${filter}${value ? `&search=${value}` : ""}`);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inbox Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified inbox for all homeowner communications
          </p>
        </div>
      </div>

      {/* Dashboard Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Threads</p>
                <p className="text-2xl font-bold">{stats.totalThreads}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-orange-600">{stats.unreadMessages}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Urgent</p>
                <p className="text-2xl font-bold text-red-600">{stats.urgentThreads}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Response</p>
                <p className="text-2xl font-bold">
                  {stats.averageResponseTimeMinutes}m
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search messages or homeowners..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Threads List */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading threads...</p>
        </div>
      ) : threads.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No threads found</h3>
          <p className="text-sm text-muted-foreground">
            {filter !== "all"
              ? "No threads match this filter."
              : "Messages from homeowners will appear here."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/dashboard/inbox-command-center/${thread.id}`}
              className="block"
            >
              <Card
                className={`p-4 hover:bg-accent transition-colors cursor-pointer ${
                  thread.urgency === "urgent" ? "border-red-500 border-2" : ""
                } ${thread.unreadCount > 0 ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">
                        {thread.lead?.name || thread.lead?.email || "Unknown"}
                      </h3>
                      {thread.unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-blue-600 text-white">
                          {thread.unreadCount}
                        </Badge>
                      )}
                      {thread.urgency === "urgent" && (
                        <Badge variant="destructive">Urgent</Badge>
                      )}
                      {thread.intent && (
                        <Badge variant="outline">
                          {INTENT_LABELS[thread.intent] || thread.intent}
                        </Badge>
                      )}
                    </div>
                    {thread.summary && (
                      <p className="text-sm text-muted-foreground mb-1 line-clamp-1">
                        {thread.summary}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {thread.lastMessage}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
































