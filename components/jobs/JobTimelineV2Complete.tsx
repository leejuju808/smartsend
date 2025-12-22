"use client";

// Block 24620 — SmartSend Roofing Job Timeline v2 Complete
// The Complete Chronological Record of Everything That Happens on a Roofing Job

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Search, Sparkles, Filter } from "lucide-react";
import { format } from "date-fns";

interface TimelineEvent {
  id: string;
  job_id: string | null;
  lead_id: string | null;
  event_type: string;
  event_subtype: string | null;
  event_category: string | null;
  message: string | null;
  event_summary: string | null;
  event_data: Record<string, any>;
  created_at: string;
}

interface JobTimelineV2CompleteProps {
  jobId: string;
}

// The 10 Event Categories from Block 24620
type EventCategory =
  | "communication"
  | "crew"
  | "supplier"
  | "materials"
  | "insurance"
  | "payments"
  | "scheduling"
  | "weather"
  | "internal"
  | "status"
  | "other";

const CATEGORY_CONFIG: Record<EventCategory, { icon: string; color: string; label: string }> = {
  communication: { icon: "💬", color: "bg-blue-500/10 border-blue-500/20 text-blue-400", label: "Communication" },
  crew: { icon: "👷", color: "bg-orange-500/10 border-orange-500/20 text-orange-400", label: "Crew Actions" },
  supplier: { icon: "🚚", color: "bg-purple-500/10 border-purple-500/20 text-purple-400", label: "Supplier" },
  materials: { icon: "📦", color: "bg-green-500/10 border-green-500/20 text-green-400", label: "Materials" },
  insurance: { icon: "🛡️", color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400", label: "Insurance" },
  payments: { icon: "💰", color: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400", label: "Payments" },
  scheduling: { icon: "📅", color: "bg-pink-500/10 border-pink-500/20 text-pink-400", label: "Scheduling" },
  weather: { icon: "🌤️", color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400", label: "Weather" },
  internal: { icon: "📝", color: "bg-gray-500/10 border-gray-500/20 text-gray-400", label: "Internal Notes" },
  status: { icon: "🔄", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "Status" },
  other: { icon: "📋", color: "bg-slate-500/10 border-slate-500/20 text-slate-400", label: "Other" },
};

export function JobTimelineV2Complete({ jobId }: JobTimelineV2CompleteProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<EventCategory>>(
    new Set(["communication", "crew", "supplier", "materials", "insurance", "payments", "scheduling", "weather", "internal", "status"])
  );
  const [insights, setInsights] = useState<string[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    fetchTimelineEvents();
    fetchInsights();
  }, [jobId]);

  const fetchTimelineEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${jobId}/timeline`);
      const data = await response.json();

      if (data.events) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error("Error fetching timeline events:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
    try {
      setLoadingInsights(true);
      const response = await fetch(`/api/jobs/${jobId}/timeline/insights`);
      const data = await response.json();

      if (data.insights) {
        setInsights(data.insights);
      }
    } catch (error) {
      console.error("Error fetching insights:", error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const toggleCategoryFilter = (category: EventCategory) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by category
    filtered = filtered.filter((event) => {
      const category = (event.event_category || "other") as EventCategory;
      return categoryFilters.has(category);
    });

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((event) => {
        const message = event.message?.toLowerCase() || "";
        const summary = event.event_summary?.toLowerCase() || "";
        const type = event.event_type.toLowerCase();
        const dataStr = JSON.stringify(event.event_data || {}).toLowerCase();
        return (
          message.includes(query) ||
          summary.includes(query) ||
          type.includes(query) ||
          dataStr.includes(query)
        );
      });
    }

    return filtered;
  }, [events, categoryFilters, searchQuery]);

  // Group events by date for chronological display
  const groupedEvents = useMemo(() => {
    const grouped: Record<string, TimelineEvent[]> = {};

    filteredEvents.forEach((event) => {
      const date = format(new Date(event.created_at), "MMMM d, yyyy");
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(event);
    });

    // Sort events within each date group (newest first)
    Object.keys(grouped).forEach((date) => {
      grouped[date].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return grouped;
  }, [filteredEvents]);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Loading timeline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Job Timeline</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete chronological record of everything that happens on this job
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInsights}
          disabled={loadingInsights}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {loadingInsights ? "Generating..." : "Refresh Insights"}
        </Button>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <span className="text-xl">✨</span>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2">AI Insights</p>
                <div className="space-y-1">
                  {insights.map((insight, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground">
                      {insight}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="space-y-3">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_CONFIG).map(([category, config]) => (
            <button
              key={category}
              onClick={() => toggleCategoryFilter(category as EventCategory)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                categoryFilters.has(category as EventCategory)
                  ? `${config.color} border`
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {config.icon} {config.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search timeline events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Timeline Events - Chronological by Date */}
      {filteredEvents.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <p>No timeline events found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEvents)
            .sort(([dateA], [dateB]) => 
              new Date(dateB).getTime() - new Date(dateA).getTime()
            )
            .map(([date, dateEvents]) => (
              <div key={date} className="space-y-3">
                {/* Date Header */}
                <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-sm font-semibold text-muted-foreground px-2">
                    📅 {date}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Events for this date */}
                <div className="space-y-2 pl-4 border-l-2 border-border">
                  {dateEvents.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      event={event}
                      isExpanded={expandedEvents.has(event.id)}
                      onToggleExpand={() => toggleEventExpanded(event.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function TimelineEventCard({
  event,
  isExpanded,
  onToggleExpand,
}: {
  event: TimelineEvent;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const category = (event.event_category || "other") as EventCategory;
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const hasDetails = event.event_data && Object.keys(event.event_data).length > 0;

  // Format time
  const time = format(new Date(event.created_at), "h:mm a");

  // Generate human-readable message
  const displayMessage = event.message || event.event_summary || formatEventMessage(event);

  return (
    <Card className={`transition-all ${config.color}`}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <span className="text-xl">{config.icon}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">
                    {time}
                  </span>
                  <span className="font-semibold text-sm">
                    {displayMessage}
                  </span>
                  <Badge variant="outline" className={`text-xs ${config.color}`}>
                    {config.label}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Expandable Details */}
            {hasDetails && (
              <div>
                <button
                  onClick={onToggleExpand}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Show Details
                    </>
                  )}
                </button>
                {isExpanded && (
                  <div className="mt-2 bg-black/20 border border-white/10 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-xs text-muted-foreground">
                      {JSON.stringify(event.event_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to format event messages
function formatEventMessage(event: TimelineEvent): string {
  const type = event.event_type;
  
  // Map event types to human-readable messages
  const messageMap: Record<string, string> = {
    homeowner_message_inbound: "Homeowner sent a message",
    homeowner_message_outbound: "Message sent to homeowner",
    homeowner_confirmation: "Homeowner confirmed",
    crew_arrived: "Crew arrived on-site",
    crew_assigned: "Crew assigned to job",
    supplier_confirmed: "Supplier confirmed delivery",
    material_shortage_alert: "Material shortage reported",
    insurance_supplement_approved: "Supplement approved",
    payment_deposit_collected: "Deposit collected",
    payment_final_collected: "Final payment collected",
    scheduling_installation_scheduled: "Installation scheduled",
    scheduling_weather_delay: "Weather delay",
    status_approved: "Job approved",
    status_scheduled: "Job scheduled",
    status_completed: "Job completed",
  };

  return messageMap[type] || type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}






































