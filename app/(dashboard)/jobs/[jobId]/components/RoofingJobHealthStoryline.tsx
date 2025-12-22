"use client";

import React from "react";
import type { RoofingHealthTimelineEvent } from "../../_lib/fetchRoofingJobHealthTimeline";

type Props = {
  events: RoofingHealthTimelineEvent[];
};

function badgeClasses(bucket: RoofingHealthTimelineEvent["score_bucket"]) {
  if (bucket === "hot") {
    return "bg-red-500/10 text-red-300 border border-red-500/40";
  }
  if (bucket === "warm") {
    return "bg-amber-500/10 text-amber-300 border border-amber-500/40";
  }
  return "bg-zinc-800 text-zinc-200 border border-zinc-700";
}

export const RoofingJobHealthStoryline: React.FC<Props> = ({ events }) => {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
        No health events yet. As this homeowner opens emails, clicks, and replies,
        we'll show the story of how this job heats up here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Job Health Storyline
      </p>

      <ol className="mt-3 space-y-3 text-xs text-zinc-300">
        {events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] text-zinc-400">
              ●
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-zinc-50">
                  {event.title}
                </p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${badgeClasses(
                    event.score_bucket
                  )}`}
                >
                  <span className="font-semibold">{event.latest_score}</span>
                  <span className="text-[9px] text-zinc-400">/100</span>
                </span>
              </div>
              {event.description && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  {event.description}
                </p>
              )}
              <p className="mt-1 text-[10px] text-zinc-500">
                {new Date(event.created_at).toLocaleString()}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};















































