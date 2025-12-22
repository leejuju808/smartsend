"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  Mail,
  MessageSquare,
  Flame,
  RefreshCw,
  CheckSquare,
  Square,
  Megaphone,
  Tag,
  UserPlus,
  Search,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type ActivityEventType =
  | "email_sent"
  | "reply"
  | "intent_hot"
  | "intent_warm"
  | "status_change"
  | "task_created"
  | "task_completed"
  | "campaign_start"
  | "campaign_pause"
  | "campaign_resume"
  | "tag_added"
  | "tag_removed"
  | "contact_created";

interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string | null;
  contact: {
    id: string;
    email: string;
    name: string;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
  reply_thread_id: string | null;
  task_id: string | null;
  user_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface ActivityResponse {
  events: ActivityEvent[];
  pagination: {
    has_more: boolean;
    cursor: string | null;
    limit: number;
  };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "email_sent", label: "Sends" },
  { id: "reply", label: "Replies" },
  { id: "intent_hot", label: "Hot Leads" },
  { id: "status_change", label: "Status Changes" },
  { id: "task_created,task_completed", label: "Tasks" },
  { id: "campaign_start,campaign_pause,campaign_resume", label: "Campaigns" },
];

const DATE_RANGES = [
  { id: "today", label: "Today" },
  { id: "7days", label: "Last 7 days" },
  { id: "30days", label: "Last 30 days" },
  { id: "all", label: "All" },
];

function getEventIcon(type: ActivityEventType) {
  switch (type) {
    case "email_sent":
      return Mail;
    case "reply":
      return MessageSquare;
    case "intent_hot":
      return Flame;
    case "intent_warm":
      return MessageSquare;
    case "status_change":
      return RefreshCw;
    case "task_created":
      return Square;
    case "task_completed":
      return CheckSquare;
    case "campaign_start":
    case "campaign_pause":
    case "campaign_resume":
      return Megaphone;
    case "tag_added":
    case "tag_removed":
      return Tag;
    case "contact_created":
      return UserPlus;
    default:
      return Mail;
  }
}

function getEventColor(type: ActivityEventType) {
  switch (type) {
    case "email_sent":
      return "text-blue-600";
    case "reply":
      return "text-purple-600";
    case "intent_hot":
      return "text-red-600";
    case "intent_warm":
      return "text-orange-600";
    case "status_change":
      return "text-indigo-600";
    case "task_created":
    case "task_completed":
      return "text-green-600";
    case "campaign_start":
    case "campaign_pause":
    case "campaign_resume":
      return "text-yellow-600";
    case "tag_added":
    case "tag_removed":
      return "text-gray-600";
    case "contact_created":
      return "text-blue-500";
    default:
      return "text-gray-600";
  }
}

function getEventBadge(event: ActivityEvent): string | null {
  if (event.type === "intent_hot") return "HOT";
  if (event.type === "intent_warm") return "WARM";
  if (event.metadata?.intent === "HOT") return "HOT";
  if (event.metadata?.intent === "WARM") return "WARM";
  if (event.metadata?.status === "Customer") return "Customer";
  if (event.metadata?.status === "Not Interested") return "Not Interested";
  if (event.type === "task_created" && event.user_id === null) return "Auto";
  return null;
}

function getEventLink(event: ActivityEvent): string | null {
  if (event.contact?.id) {
    return `/contacts/${event.contact.id}`;
  }
  if (event.campaign?.id) {
    return `/campaigns/${event.campaign.id}`;
  }
  if (event.reply_thread_id) {
    return `/inbox/${event.reply_thread_id}`;
  }
  if (event.task_id) {
    return `/tasks`;
  }
  return null;
}

function formatDateGroup(date: string): string {
  const parsed = parseISO(date);
  if (isToday(parsed)) {
    return "Today";
  }
  if (isYesterday(parsed)) {
    return "Yesterday";
  }
  return format(parsed, "MMM d");
}

function groupEventsByDate(events: ActivityEvent[]): Record<string, ActivityEvent[]> {
  const groups: Record<string, ActivityEvent[]> = {};
  
  events.forEach((event) => {
    const groupKey = formatDateGroup(event.created_at);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(event);
  });
  
  return groups;
}

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "all") {
      params.set("types", activeFilter);
    }
    if (dateRange !== "all") {
      params.set("dateRange", dateRange);
    }
    if (searchQuery) {
      params.set("search", searchQuery);
    }
    params.set("limit", "100");
    return `/api/activity?${params.toString()}`;
  }, [activeFilter, dateRange, searchQuery]);

  const { data, error, isLoading } = useSWR<ActivityResponse>(apiUrl, fetcher, {
    refreshInterval: 30000, // Poll every 30 seconds
  });

  const events = data?.events || [];
  const groupedEvents = useMemo(() => groupEventsByDate(events), [events]);

  // Sort date groups (most recent first)
  const sortedDateGroups = useMemo(() => {
    return Object.keys(groupedEvents).sort((a, b) => {
      if (a === "Today") return -1;
      if (b === "Today") return 1;
      if (a === "Yesterday") return -1;
      if (b === "Yesterday") return 1;
      return b.localeCompare(a);
    });
  }, [groupedEvents]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Activity</h1>
        <p className="mt-2 text-sm text-gray-600">
          Org-wide timeline of sends, replies, status changes, tasks, and campaigns
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Type Filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeFilter === filter.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap gap-2">
          {DATE_RANGES.map((range) => (
            <button
              key={range.id}
              onClick={() => setDateRange(range.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                dateRange === range.id
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by contact, campaign, or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Activity Feed */}
      {error ? (
        <div className="text-center py-12">
          <div className="text-red-500 mb-2">Failed to load activity feed</div>
          <div className="text-sm text-gray-600">{error.message || "Unknown error"}</div>
        </div>
      ) : isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading activities...</p>
        </div>
      ) : events.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-600">No activities found</p>
          <p className="text-sm text-gray-500 mt-1">
            Activities will appear here as events occur in your organization
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedDateGroups.map((dateGroup) => (
            <div key={dateGroup}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{dateGroup}</h2>
          <Card className="divide-y">
            {groupedEvents[dateGroup].map((event) => {
              const Icon = getEventIcon(event.type);
              const color = getEventColor(event.type);
              const link = getEventLink(event);
              const badge = getEventBadge(event);

              const content = (
                <div className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 mt-0.5 ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{event.title}</div>
                          {event.description && (
                            <div className="mt-1 text-sm text-gray-600 line-clamp-2">
                              {event.description}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            {event.contact && (
                              <Link
                                href={`/contacts/${event.contact.id}`}
                                className="hover:text-blue-600 hover:underline"
                              >
                                {event.contact.name || event.contact.email}
                              </Link>
                            )}
                            {event.campaign && (
                              <Link
                                href={`/campaigns/${event.campaign.id}`}
                                className="hover:text-blue-600 hover:underline"
                              >
                                {event.campaign.name}
                              </Link>
                            )}
                            {event.metadata?.sequence_step && (
                              <span>Step: {event.metadata.sequence_step}</span>
                            )}
                            {event.metadata?.due_date && (
                              <span>Due: {format(parseISO(event.metadata.due_date), "MMM d")}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {badge && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                badge === "HOT"
                                  ? "bg-red-100 text-red-700"
                                  : badge === "WARM"
                                  ? "bg-orange-100 text-orange-700"
                                  : badge === "Customer"
                                  ? "bg-green-100 text-green-700"
                                  : badge === "Not Interested"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {badge}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {formatDistanceToNow(parseISO(event.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );

              return link ? (
                <Link key={event.id} href={link}>
                  {content}
                </Link>
              ) : (
                <div key={event.id}>{content}</div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
