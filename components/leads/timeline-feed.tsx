"use client";

import { useEffect, useState } from "react";
import { TimelineEventCard, LeadEvent } from "./timeline-event-card";
import { RefreshCw } from "lucide-react";
import { Card } from "@/src/components/ui/Card";

interface TimelineFeedProps {
  leadId: string;
  onRefresh?: () => void;
}

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * Timeline feed component that displays all lead events
 */
export function TimelineFeed({ leadId, onRefresh }: TimelineFeedProps) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/leads/${leadId}/events`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      const data = await response.json();
      setEvents(data.events || []);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
      console.error("Error fetching timeline events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [leadId]);

  if (loading && events.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading timeline...</span>
        </div>
      </Card>
    );
  }

  if (error && events.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-destructive">
          <p>Error loading timeline: {error}</p>
          <button
            onClick={fetchEvents}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">No events yet</p>
          <p className="text-sm mt-2">
            SmartSend activity will appear here as emails are sent and replies are received
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <TimelineEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

