// Block 20340 — Unified Activity Timeline Card

"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

interface Event {
  id: string;
  type: string;
  title?: string;
  body?: string;
  created_at: string;

  email_direction?: string;
  email_status?: string;
  email_subject?: string;

  call_duration_seconds?: number;
  call_outcome?: string;

  appointment_type?: string;
  appointment_at?: string;
  appointment_status?: string;

  tag_change?: any;
  stage_from?: string;
  stage_to?: string;

  property_change?: any;
  roof_change?: any;
  insurance_change?: any;

  enrichment_provider?: string;
  enrichment_status?: string;

  next_action_recommendation?: any;
}

interface ActivityTimelineCardProps {
  conversationId: string;
}

export function ActivityTimelineCard({
  conversationId,
}: ActivityTimelineCardProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/activity?conversation_id=${conversationId}`);
      
      if (!res.ok) {
        throw new Error("Failed to load activity");
      }

      const json = await res.json();
      setEvents(json.activity ?? []);
    } catch (error) {
      console.error("Timeline load error", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  function icon(type: string) {
    switch (type) {
      case "email":
        return "✉️";
      case "reply":
        return "💬";
      case "call":
        return "📞";
      case "appointment":
        return "📅";
      case "tag":
        return "🏷️";
      case "stage_change":
        return "🔄";
      case "profile_update":
        return "🏠";
      case "enrichment":
        return "🔍";
      case "insurance_update":
        return "📑";
      case "next_action":
        return "⭐";
      case "note":
        return "📝";
      case "status_change":
        return "🔄";
      case "value_change":
        return "💰";
      case "follow_up":
        return "⏰";
      case "system":
        return "⚙️";
      default:
        return "•";
    }
  }

  return (
    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Timeline</p>
        <button
          onClick={load}
          className="text-[10px] text-gray-400 underline"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        {events.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-4">
            No activity logged yet for this homeowner.
          </p>
        )}

        {events.map((e) => {
          const time = format(new Date(e.created_at), "MMM d, h:mm a");
          return (
            <div key={e.id} className="flex gap-2">
              <div className="w-5 text-base">{icon(e.type)}</div>

              <div className="flex-1 text-xs">
                <p className="font-semibold text-gray-800">
                  {e.title || e.type}
                </p>

                <p className="text-[10px] text-gray-400">{time}</p>

                {e.body && (
                  <p className="text-[11px] text-gray-600 mt-0.5">{e.body}</p>
                )}

                {/* Extra meta based on type */}
                {e.type === "email" && (
                  <p className="text-[11px] text-gray-500">
                    {e.email_direction === "outbound" ? "Sent email" : "Received email"}
                    {e.email_subject && ` — "${e.email_subject}"`}
                  </p>
                )}

                {e.type === "reply" && (
                  <p className="text-[11px] text-gray-500">
                    Reply received
                    {e.email_subject && ` — "${e.email_subject}"`}
                  </p>
                )}

                {e.type === "call" && (
                  <p className="text-[11px] text-gray-500">
                    Outcome: {e.call_outcome || "N/A"}  
                    {e.call_duration_seconds
                      ? ` · ${Math.round(e.call_duration_seconds / 60)} min`
                      : ""}
                  </p>
                )}

                {e.type === "appointment" && (
                  <p className="text-[11px] text-gray-500">
                    {e.appointment_type} · {e.appointment_status}
                    {e.appointment_at &&
                      ` · ${format(new Date(e.appointment_at), "MMM d, h:mm a")}`}
                  </p>
                )}

                {e.type === "tag" && e.tag_change && (
                  <p className="text-[11px] text-gray-500">
                    Tags updated
                  </p>
                )}

                {e.type === "stage_change" && (
                  <p className="text-[11px] text-gray-500">
                    {e.stage_from} → {e.stage_to}
                  </p>
                )}

                {e.type === "enrichment" && (
                  <p className="text-[11px] text-gray-500">
                    Lookup via {e.enrichment_provider} ({e.enrichment_status})
                  </p>
                )}

                {e.type === "insurance_update" && e.insurance_change && (
                  <p className="text-[11px] text-gray-500">
                    Insurance updated
                  </p>
                )}

                {e.type === "profile_update" && (e.property_change || e.roof_change) && (
                  <p className="text-[11px] text-gray-500">
                    Profile updated
                  </p>
                )}

                {e.type === "next_action" && e.next_action_recommendation && (
                  <p className="text-[11px] text-gray-500">
                    Next best action recommended
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

