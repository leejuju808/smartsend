"use client";

import { useEffect, useState } from "react";

type LeadTimelineEvent = {
  id: string;
  lead_id: string;
  direction: "outbound" | "inbound";
  event_type: string;
  subject: string | null;
  body_preview: string | null;
  event_time: string;
  intent: string | null;
  is_hot: boolean;
};

interface LeadTimelineProps {
  leadId: string;
}

export function LeadTimeline({ leadId }: LeadTimelineProps) {
  const [events, setEvents] = useState<LeadTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTimeline() {
    try {
      const res = await fetch(`/api/leads/${leadId}/timeline`, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch timeline");

      const data: LeadTimelineEvent[] = await res.json();
      setEvents(data);
    } catch (err) {
      console.error("Error loading lead timeline:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 10_000); // 10s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
        Loading timeline…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
        No activity yet for this lead.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event, idx) => {
        const isOutbound = event.direction === "outbound";
        const isInbound = event.direction === "inbound";

        return (
          <div
            key={event.id}
            className={`flex w-full ${
              isOutbound ? "justify-start" : "justify-end"
            }`}
          >
            <div className="flex max-w-xl flex-col gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide">
                    {isOutbound ? "SmartSend → Homeowner" : "Homeowner → You"}
                  </span>
                  {event.intent && (
                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide">
                      {event.intent}
                    </span>
                  )}
                  {event.is_hot && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-400">
                      Hot Lead
                    </span>
                  )}
                </div>
                <span className="text-[0.7rem] text-neutral-500">
                  {new Date(event.event_time).toLocaleString()}
                </span>
              </div>

              {event.subject && (
                <div className="text-sm font-semibold text-neutral-100">
                  {event.subject}
                </div>
              )}

              {event.body_preview && (
                <p className="whitespace-pre-line text-sm text-neutral-300">
                  {event.body_preview}
                  {event.body_preview.length === 240 && "…"}
                </p>
              )}

              <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-neutral-500">
                {event.event_type}
                {idx === events.length - 1 && event.is_hot && " • Latest"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

























































