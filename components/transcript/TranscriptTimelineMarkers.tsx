// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// TranscriptTimelineMarkers: Shows timeline event markers alongside transcript
// Markers: save event, proposal sent, photos requested, price discussion, frustration, offer accepted

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TranscriptMessage } from "./TranscriptBubble";

interface TimelineEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_category: string | null;
  event_summary: string | null;
  event_data: Record<string, any>;
  created_at: string;
}

interface TranscriptTimelineMarkersProps {
  leadId: string;
  messages: TranscriptMessage[];
  onJumpToMessage: (messageId: string) => void;
}

const EVENT_MARKERS: Record<string, { emoji: string; label: string; color: string }> = {
  job_saved: { emoji: "🚨", label: "Save Event", color: "text-yellow-400" },
  proposal_sent: { emoji: "📄", label: "Proposal Sent", color: "text-blue-400" },
  photos_requested: { emoji: "📸", label: "Photos Requested", color: "text-purple-400" },
  price_discussion: { emoji: "💰", label: "Price Discussion", color: "text-green-400" },
  frustration: { emoji: "😡", label: "Frustration", color: "text-red-400" },
  offer_accepted: { emoji: "🤝", label: "Offer Accepted", color: "text-emerald-400" },
  estimate_scheduled: { emoji: "📅", label: "Estimate Scheduled", color: "text-cyan-400" },
  estimate_completed: { emoji: "✅", label: "Estimate Completed", color: "text-green-400" },
};

export function TranscriptTimelineMarkers({
  leadId,
  messages,
  onJumpToMessage,
}: TranscriptTimelineMarkersProps) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetchTimelineEvents();

    // Subscribe to timeline updates
    const channel = supabase
      .channel(`timeline_${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_timelines",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setTimelineEvents((prev) => [...prev, payload.new as TimelineEvent]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const fetchTimelineEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("job_timelines")
        .select("*")
        .eq("lead_id", leadId)
        .in("event_type", Object.keys(EVENT_MARKERS))
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching timeline events:", error);
        return;
      }

      setTimelineEvents(data || []);
    } catch (error) {
      console.error("Error fetching timeline events:", error);
    }
  };

  // Find the closest message to each timeline event
  const getClosestMessage = (eventTime: string): TranscriptMessage | null => {
    const eventDate = new Date(eventTime).getTime();
    let closest: TranscriptMessage | null = null;
    let minDiff = Infinity;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).getTime();
      const diff = Math.abs(msgDate - eventDate);
      if (diff < minDiff) {
        minDiff = diff;
        closest = msg;
      }
    });

    // Only return if within 1 hour of the event
    return minDiff < 3600000 ? closest : null;
  };

  // Group events by their closest message
  const eventsByMessage = new Map<string, TimelineEvent[]>();
  timelineEvents.forEach((event) => {
    const closestMsg = getClosestMessage(event.created_at);
    if (closestMsg) {
      const existing = eventsByMessage.get(closestMsg.id) || [];
      eventsByMessage.set(closestMsg.id, [...existing, event]);
    }
  });

  // Create a map of message IDs to their index for positioning
  const messageIndexMap = new Map<string, number>();
  messages.forEach((msg, idx) => {
    messageIndexMap.set(msg.id, idx);
  });

  // Render markers inline with messages (return null, markers will be rendered in TranscriptViewer)
  return null;
}

// Helper function to get markers for a specific message
export function getMarkersForMessage(
  messageId: string,
  timelineEvents: TimelineEvent[],
  messages: TranscriptMessage[]
): TimelineEvent[] {
  const message = messages.find((m) => m.id === messageId);
  if (!message) return [];

  const messageTime = new Date(message.created_at).getTime();
  const oneHour = 3600000;

  return timelineEvents.filter((event) => {
    const eventTime = new Date(event.created_at).getTime();
    const diff = Math.abs(eventTime - messageTime);
    return diff < oneHour;
  });
}

