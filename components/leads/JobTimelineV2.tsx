"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Search, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface TimelineEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_category: string | null;
  event_summary: string | null;
  event_data: Record<string, any>;
  created_at: string;
}

interface JobTimelineV2Props {
  leadId: string;
}

type EventCategory = 
  | "communication" 
  | "ai_intelligence" 
  | "pipeline" 
  | "assignment" 
  | "risk" 
  | "audit";

const CATEGORY_CONFIG: Record<EventCategory, { icon: string; color: string; label: string }> = {
  communication: { icon: "💬", color: "bg-blue-500/10 border-blue-500/20 text-blue-400", label: "Communication" },
  ai_intelligence: { icon: "🧠", color: "bg-purple-500/10 border-purple-500/20 text-purple-400", label: "AI Intelligence" },
  pipeline: { icon: "📌", color: "bg-green-500/10 border-green-500/20 text-green-400", label: "Pipeline" },
  assignment: { icon: "👤", color: "bg-orange-500/10 border-orange-500/20 text-orange-400", label: "Routing & Assignment" },
  risk: { icon: "⚠️", color: "bg-red-500/10 border-red-500/20 text-red-400", label: "Risk Signals" },
  audit: { icon: "📝", color: "bg-gray-500/10 border-gray-500/20 text-gray-400", label: "Audit / System" },
};

const MAJOR_EVENT_TYPES = [
  "job_won",
  "job_lost",
  "proposal_sent",
  "estimate_completed",
  "lead_routed",
  "job_probability_updated",
];

export function JobTimelineV2({ leadId }: JobTimelineV2Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<EventCategory>>(
    new Set(["communication", "ai_intelligence", "pipeline", "assignment", "risk", "audit"])
  );
  const [majorEventsOnly, setMajorEventsOnly] = useState(false);
  const [narrativeSummary, setNarrativeSummary] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  const supabase = createClient();

  useEffect(() => {
    fetchTimelineEvents();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`job_timeline_v2_${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_timelines",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setEvents((prev) => [payload.new as TimelineEvent, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const fetchTimelineEvents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("job_timelines")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching timeline events:", error);
        return;
      }

      setEvents(data || []);
    } catch (error) {
      console.error("Error fetching timeline events:", error);
    } finally {
      setLoading(false);
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
      const category = getEventCategory(event);
      return categoryFilters.has(category);
    });

    // Filter by major events only
    if (majorEventsOnly) {
      filtered = filtered.filter((event) => MAJOR_EVENT_TYPES.includes(event.event_type));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((event) => {
        const summary = event.event_summary?.toLowerCase() || "";
        const type = event.event_type.toLowerCase();
        const dataStr = JSON.stringify(event.event_data || {}).toLowerCase();
        return summary.includes(query) || type.includes(query) || dataStr.includes(query);
      });
    }

    return filtered;
  }, [events, categoryFilters, majorEventsOnly, searchQuery]);

  const generateNarrativeSummary = async () => {
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/timeline/narrative`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.summary) {
        setNarrativeSummary(data.summary);
      }
    } catch (error) {
      console.error("Error generating narrative summary:", error);
    } finally {
      setGeneratingSummary(false);
    }
  };

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
        <h2 className="text-xl font-bold">Job Timeline</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={generateNarrativeSummary}
          disabled={generatingSummary}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {generatingSummary ? "Generating..." : "Generate Quick Summary"}
        </Button>
      </div>

      {/* AI Narrative Summary */}
      {narrativeSummary && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <span className="text-xl">✨</span>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">AI Story Summary</p>
                <p className="text-sm text-muted-foreground">{narrativeSummary}</p>
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

        {/* Search and Major Events Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search timeline events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <button
            onClick={() => setMajorEventsOnly(!majorEventsOnly)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              majorEventsOnly
                ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            ⭐ Only Major Events
          </button>
        </div>
      </div>

      {/* Timeline Events */}
      {filteredEvents.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <p>No timeline events found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <TimelineEventCard
              key={event.id}
              event={event}
              isExpanded={expandedEvents.has(event.id)}
              onToggleExpand={() => toggleEventExpanded(event.id)}
            />
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
  const category = getEventCategory(event);
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.audit;
  const isMajorEvent = MAJOR_EVENT_TYPES.includes(event.event_type);
  const hasDetails = event.event_data && Object.keys(event.event_data).length > 0;

  return (
    <Card
      className={`transition-all ${
        isMajorEvent
          ? "ring-2 ring-yellow-500/50 bg-yellow-500/5"
          : config.color
      }`}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <span className="text-2xl">{config.icon}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    {event.event_summary || formatEventTitle(event.event_type)}
                  </span>
                  {isMajorEvent && (
                    <Badge variant="outline" className="text-xs bg-yellow-500/20 border-yellow-500/40">
                      ⭐ Major Event
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-xs ${config.color}`}>
                    {config.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>

            {/* Speech bubble for messages */}
            {(event.event_type.includes("reply") || event.event_type.includes("message")) && 
             event.event_data?.body_text && (
              <div className="bg-black/20 border border-white/10 rounded-lg p-3 mt-2">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {event.event_data.body_text}
                </p>
              </div>
            )}

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

function getEventCategory(event: TimelineEvent): EventCategory {
  if (event.event_category) {
    return event.event_category as EventCategory;
  }
  // Fallback categorization
  if (event.event_type.includes("reply") || event.event_type.includes("message")) {
    return "communication";
  }
  if (event.event_type.includes("tone") || event.event_type.includes("intent") || event.event_type.includes("momentum") || event.event_type.includes("probability")) {
    return "ai_intelligence";
  }
  if (event.event_type.includes("estimate") || event.event_type.includes("proposal") || event.event_type.includes("won") || event.event_type.includes("lost")) {
    return "pipeline";
  }
  if (event.event_type.includes("routed") || event.event_type.includes("assigned")) {
    return "assignment";
  }
  if (event.event_type.includes("risk") || event.event_type.includes("missed")) {
    return "risk";
  }
  return "audit";
}

function formatEventTitle(eventType: string): string {
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

