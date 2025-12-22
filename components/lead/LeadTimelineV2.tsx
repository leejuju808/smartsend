"use client";

// Block 21733 — SmartSend Roofing Lead Timeline UI v2
// Filters, Search, and Channel Icons for "WTF Happened With This Lead?"

import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

type TimelineEvent = {
  id: string;
  lead_id: string;
  event_type: string;
  event_subtype: string | null;
  message: string;
  metadata: any;
  created_at: string;
};

type Props = {
  leadId: string;
};

const EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "email", label: "Emails" },
  { id: "reply", label: "Replies" },
  { id: "call", label: "Calls" },
  { id: "note", label: "Notes" },
  { id: "system", label: "System" },
  { id: "quote", label: "Quotes" },
];

function getChannel(event: TimelineEvent): string {
  switch (event.event_type) {
    case "email_sent":
      return "email";
    case "reply_received":
      return "reply";
    case "call_logged":
      return "call";
    case "note":
      return "note";
    case "status_changed":
    case "heat_score_changed":
      return "system";
    case "quote_created":
    case "quote_signed":
      return "quote";
    default:
      return "system";
  }
}

function getIcon(event: TimelineEvent): string {
  const channel = getChannel(event);
  if (channel === "email") return "✉️";
  if (channel === "reply") return "💬";
  if (channel === "call") return "☎️";
  if (channel === "note") return "📝";
  if (channel === "quote") return "📄";
  if (event.event_type === "quote_signed") return "💰";
  if (event.event_type === "heat_score_changed") return "🔥";
  return "🔄";
}

function getBadgeText(event: TimelineEvent): string {
  const channel = getChannel(event);
  if (channel === "email") return "Email";
  if (channel === "reply") return "Reply";
  if (channel === "call") return "Call";
  if (channel === "note") return "Note";
  if (channel === "quote" && event.event_type === "quote_signed")
    return "Job Won";
  if (channel === "quote") return "Quote";
  return "System";
}

export function LeadTimelineV2({ leadId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [days, setDays] = useState<string>("30");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("lead_id", leadId);
    if (days) params.set("days", days);
    if (search) params.set("search", search);

    // Map filter to event_types if needed
    // For now, we let server return all and filter client-side by channel
    fetch(`/api/lead-timeline?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading timeline:", err);
        setLoading(false);
      });
  }, [leadId, days, search]);

  const filteredEvents = useMemo(() => {
    if (activeFilter === "all") return events;
    return events.filter((e) => getChannel(e) === activeFilter);
  }, [events, activeFilter]);

  if (loading) {
    return <div className="text-sm text-gray-400">Loading timeline…</div>;
  }

  if (!events.length) {
    return (
      <div className="text-sm text-gray-400">
        No activity yet for this lead.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                activeFilter === f.id
                  ? "bg-yellow-500 text-black border-yellow-500"
                  : "bg-white/5 text-gray-300 border-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="bg-black border border-white/10 text-xs text-gray-200 rounded-lg px-2 py-1"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="">All time</option>
          </select>

          <input
            placeholder="Search notes, replies, quotes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-black border border-white/10 text-xs text-gray-200 rounded-lg px-2 py-1 w-52"
          />
        </div>
      </div>

      {/* Timeline list */}
      <div className="space-y-3">
        {filteredEvents.map((event) => {
          const icon = getIcon(event);
          const badge = getBadgeText(event);
          const timeAgo = formatDistanceToNow(new Date(event.created_at), {
            addSuffix: true,
          });

          // optional main snippet
          const snippet =
            event.metadata?.snippet ||
            event.metadata?.text ||
            event.metadata?.note ||
            "";

          return (
            <div
              key={event.id}
              className="flex gap-3 rounded-xl bg-white/5 border border-white/10 p-3"
            >
              <div className="flex flex-col items-center">
                <div className="text-lg">{icon}</div>
                <div className="w-px flex-1 bg-white/10 mt-1" />
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full bg-white/10 px-2 py-0.5 text-gray-200">
                      {badge}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo}</span>
                  </div>
                </div>

                <div className="text-sm text-white font-medium">
                  {event.message}
                </div>

                {snippet && (
                  <div className="text-xs text-gray-300 line-clamp-2">
                    {snippet}
                  </div>
                )}

                {/* Optional: toggleable full metadata for nerds */}
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[11px] text-gray-500 cursor-pointer">
                      View details
                    </summary>
                    <pre className="mt-1 text-[11px] text-gray-400 bg-black/40 rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}










































