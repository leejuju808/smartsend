// Block 21727 — SmartSend Roofing Lead Timeline v1
// UI Component — Lead Timeline Feed

"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type TimelineEvent = {
  id: string;
  lead_id: string;
  event_type: string;
  event_subtype: string | null;
  message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

export default function LeadTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTimeline = async () => {
      try {
        const res = await fetch(`/api/lead-timeline?lead_id=${leadId}`);
        if (!res.ok) {
          console.error("Failed to load timeline");
          return;
        }
        const data = await res.json();
        setEvents(data);
      } catch (error) {
        console.error("Error loading timeline:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [leadId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">Loading timeline...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">No timeline events yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div
          key={event.id}
          className="border-l-4 pl-4 py-2 border-yellow-500"
        >
          <div className="text-sm text-gray-400">
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </div>
          <div className="font-semibold text-white">
            {event.message || event.event_type}
          </div>

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <pre className="text-xs text-gray-400 mt-1">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}










































