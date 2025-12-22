"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface TimelineEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

interface JobTimelineProps {
  leadId: string;
}

export function JobTimeline({ leadId }: JobTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchTimelineEvents();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`job_timeline_${leadId}`)
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

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Loading timeline...</p>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>No timeline events yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <TimelineItem key={event.id} event={event} />
      ))}
    </div>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const time = new Date(event.created_at).toLocaleString();
  const data = event.event_data || {};

  return (
    <div className="flex gap-3">
      <div className="w-12 flex justify-center">
        <EventIcon type={event.event_type} />
      </div>

      <div className="flex-1 border-l border-white/10 pl-4">
        <div className="text-xs text-gray-400">{time}</div>
        <div className="text-sm font-semibold capitalize">
          {formatTitle(event.event_type)}
        </div>
        <div className="text-sm text-gray-300">{formatBody(event)}</div>
      </div>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const map: Record<string, string> = {
    homeowner_reply: "💬",
    estimator_reply: "📤",
    outbound_message: "📨",
    tone_intent_detected: "🎯",
    lead_created: "✨",
    lead_routed: "🚦",
    heat_score_updated: "🔥",
    job_probability_updated: "📈",
    lead_resurrection_triggered: "🧟‍♂️",
    estimate_booked: "📅",
    estimate_completed: "✅",
    proposal_sent: "📄",
    job_won: "🏆",
    job_lost: "❌",
    follow_up_completed: "✔️",
    follow_up_missed: "⚠️",
    internal_note: "📝",
    file_uploaded: "📎",
    coaching_trigger: "🎓",
  };

  return <span className="text-xl">{map[type] || "📌"}</span>;
}

function formatTitle(type: string): string {
  return type.replace(/_/g, " ");
}

function formatBody(event: TimelineEvent): string {
  const d = event.event_data || {};
  
  switch (event.event_type) {
    case "homeowner_reply":
      return d.message || d.body || "Homeowner replied";
    
    case "estimator_reply":
      return d.message || d.body || "Estimator replied";
    
    case "outbound_message":
      return d.subject 
        ? `Subject: ${d.subject}`
        : d.message || "Outbound message sent";
    
    case "tone_intent_detected":
      return d.tone && d.intent
        ? `Tone: ${d.tone}, Intent: ${d.intent}`
        : d.intent || d.tone || "Tone/intent detected";
    
    case "heat_score_updated":
      return d.previous_score !== undefined && d.new_score !== undefined
        ? `Score changed from ${d.previous_score} to ${d.new_score}`
        : d.new_score !== undefined
        ? `Heat score: ${d.new_score}`
        : "Heat score updated";
    
    case "job_probability_updated":
      return d.previous_probability !== undefined && d.new_probability !== undefined
        ? `Probability changed from ${d.previous_probability}% to ${d.new_probability}%`
        : d.new_probability !== undefined
        ? `Job probability: ${d.new_probability}%`
        : "Job probability updated";
    
    case "lead_routed":
      return d.estimator_name
        ? `Routed to ${d.estimator_name}`
        : d.estimator_id
        ? `Routed to estimator`
        : "Lead routed";
    
    case "proposal_sent":
      return d.amount
        ? `Proposal amount: $${d.amount}`
        : "Proposal sent";
    
    case "estimate_booked":
      return d.scheduled_for
        ? `Scheduled for: ${d.scheduled_for}`
        : d.scheduled_at
        ? `Scheduled for: ${new Date(d.scheduled_at).toLocaleString()}`
        : "Estimate booked";
    
    case "estimate_completed":
      return d.estimate_id
        ? `Estimate completed: ${d.estimate_id}`
        : "Estimate completed";
    
    case "job_won":
      return d.value
        ? `Value: $${d.value}`
        : "Job won";
    
    case "job_lost":
      return d.reason
        ? `Reason: ${d.reason}`
        : "Job lost";
    
    case "follow_up_completed":
      return d.follow_up_type
        ? `Follow-up completed: ${d.follow_up_type}`
        : "Follow-up completed";
    
    case "follow_up_missed":
      return d.follow_up_type
        ? `Follow-up missed: ${d.follow_up_type}`
        : "Follow-up missed";
    
    case "lead_resurrection_triggered":
      return d.resurrection_type
        ? `Resurrection triggered: ${d.resurrection_type}`
        : "Lead resurrection triggered";
    
    case "internal_note":
      return d.note || d.body || "Internal note added";
    
    case "file_uploaded":
      return d.filename
        ? `File uploaded: ${d.filename}`
        : d.file_type
        ? `File uploaded: ${d.file_type}`
        : "File uploaded";
    
    case "coaching_trigger":
      return d.coaching_type
        ? `Coaching triggered: ${d.coaching_type}`
        : d.message || "Coaching triggered";
    
    default:
      // Fallback: try to show meaningful data
      if (d.message) return d.message;
      if (d.body) return d.body;
      if (d.description) return d.description;
      return JSON.stringify(d);
  }
}

