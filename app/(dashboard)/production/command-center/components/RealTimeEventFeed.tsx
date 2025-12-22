"use client";

// Block 246000 — Real-Time Event Feed
// Timeline of: job start, job paused, material delivered, crew clock-in, issue reported, inspection scheduled, job completed

import { Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface Event {
  id: string;
  event_type: string;
  message: string | null;
  details: any;
  created_at: string;
  job_id: string | null;
  crew_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
  } | null;
  crews?: {
    id: string;
    name: string;
  } | null;
}

interface RealTimeEventFeedProps {
  events: Event[];
}

export function RealTimeEventFeed({ events }: RealTimeEventFeedProps) {
  const recentEvents = events.slice(0, 20);

  const getEventIcon = (eventType: string) => {
    return <Activity className="h-4 w-4 text-blue-400" />;
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes("completed") || eventType.includes("delivered")) {
      return "text-green-400";
    }
    if (eventType.includes("delay") || eventType.includes("issue")) {
      return "text-red-400";
    }
    if (eventType.includes("scheduled") || eventType.includes("assigned")) {
      return "text-blue-400";
    }
    return "text-zinc-400";
  };

  const formatEventType = (eventType: string) => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Real-Time Event Feed</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {recentEvents.length} recent events
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {recentEvents.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">
            <Activity className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
            <div>No recent events</div>
          </div>
        ) : (
          recentEvents.map((event, idx) => (
            <div
              key={event.id}
              className="flex items-start gap-3 pb-3 border-b border-zinc-800 last:border-0"
            >
              <div className="flex-shrink-0 mt-0.5">
                {getEventIcon(event.event_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${getEventColor(event.event_type)}`}>
                    {formatEventType(event.event_type)}
                  </span>
                  {event.crews && (
                    <span className="text-xs text-zinc-400">
                      • {event.crews.name}
                    </span>
                  )}
                </div>

                {event.jobs && (
                  <Link href={`/production/jobs/${event.jobs.id}`}>
                    <div className="text-sm text-white hover:text-blue-400 mb-1">
                      {event.jobs.title || event.jobs.address}
                    </div>
                  </Link>
                )}

                {event.message && (
                  <div className="text-xs text-zinc-400 mb-1">{event.message}</div>
                )}

                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  <span>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

























