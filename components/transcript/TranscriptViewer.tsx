// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// TranscriptViewer: Main component that displays the full transcript
// Looks like iMessage × Slack × CRM intelligence → built for roofers

"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { TranscriptBubble, TranscriptMessage } from "./TranscriptBubble";
import { TranscriptFilterBar } from "./TranscriptFilterBar";
import { TranscriptTimelineMarkers, getMarkersForMessage } from "./TranscriptTimelineMarkers";
import { cn } from "@/lib/utils";

interface TranscriptViewerProps {
  leadId: string;
  className?: string;
}

export function TranscriptViewer({ leadId, className }: TranscriptViewerProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filteredMessages, setFilteredMessages] = useState<TranscriptMessage[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    senderType: "all" as "all" | "homeowner" | "estimator" | "ai" | "system",
    tone: "all" as string,
    intent: "all" as string,
    searchQuery: "",
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchMessages();
    fetchTimelineEvents();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`transcript_${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transcript_messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as TranscriptMessage].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ));
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

  useEffect(() => {
    applyFilters();
  }, [messages, filters]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredMessages]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("transcript_messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching transcript messages:", error);
        return;
      }

      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching transcript messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...messages];

    // Filter by sender type
    if (filters.senderType !== "all") {
      filtered = filtered.filter((msg) => msg.sender_type === filters.senderType);
    }

    // Filter by tone
    if (filters.tone !== "all" && filters.tone) {
      filtered = filtered.filter((msg) => msg.tone === filters.tone);
    }

    // Filter by intent
    if (filters.intent !== "all" && filters.intent) {
      filtered = filtered.filter((msg) => msg.intent === filters.intent);
    }

    // Search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (msg) =>
          msg.message_text.toLowerCase().includes(query) ||
          msg.sender_name?.toLowerCase().includes(query) ||
          msg.tone?.toLowerCase().includes(query) ||
          msg.intent?.toLowerCase().includes(query)
      );
    }

    setFilteredMessages(filtered);
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <div className="text-gray-400">Loading transcript...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-64 text-gray-400", className)}>
        <div className="text-4xl mb-2">💬</div>
        <div className="text-sm">No messages yet</div>
        <div className="text-xs mt-1">Messages will appear here as conversations happen</div>
      </div>
    );
  }

  const handleJumpTo = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className={cn("flex flex-col h-full relative", className)}>
      {/* Filter Bar */}
      <TranscriptFilterBar
        messages={messages}
        filters={filters}
        onFiltersChange={setFilters}
        onJumpTo={handleJumpTo}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pl-16">
        <div className="space-y-4">
          {filteredMessages.map((message) => {
            const markers = getMarkersForMessage(message.id, timelineEvents, messages);
            const markerConfigs = markers.map((event) => {
              const markerMap: Record<string, { emoji: string; label: string; color: string }> = {
                job_saved: { emoji: "🚨", label: "Save Event", color: "text-yellow-400" },
                proposal_sent: { emoji: "📄", label: "Proposal Sent", color: "text-blue-400" },
                photos_requested: { emoji: "📸", label: "Photos Requested", color: "text-purple-400" },
                price_discussion: { emoji: "💰", label: "Price Discussion", color: "text-green-400" },
                frustration: { emoji: "😡", label: "Frustration", color: "text-red-400" },
                offer_accepted: { emoji: "🤝", label: "Offer Accepted", color: "text-emerald-400" },
                estimate_scheduled: { emoji: "📅", label: "Estimate Scheduled", color: "text-cyan-400" },
                estimate_completed: { emoji: "✅", label: "Estimate Completed", color: "text-green-400" },
              };
              return markerMap[event.event_type] || { emoji: "📍", label: event.event_type, color: "text-gray-400" };
            });
            return (
              <div key={message.id} id={`message-${message.id}`}>
                <TranscriptBubble message={message} timelineMarkers={markerConfigs} />
              </div>
            );
          })}
          {filteredMessages.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No messages match your filters
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

