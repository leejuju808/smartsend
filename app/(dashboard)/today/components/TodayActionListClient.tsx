"use client";

import React, { useState } from "react";
import type { TodayActionList, TodayJobItem } from "../_lib/fetchTodayActionList";
import { ContactActions } from "@/app/components/ContactActions";

type Props = {
  orgId: string;
  initialList: TodayActionList;
};

function Section({
  title,
  description,
  jobs,
  highlightEmoji,
}: {
  title: string;
  description: string;
  jobs: TodayJobItem[];
  highlightEmoji: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </p>
        <span className="text-lg">{highlightEmoji}</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">{description}</p>

      {jobs.length === 0 ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          Nothing here right now. SmartSend will add jobs as your outreach runs.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {jobs.map((job) => {
            const score = job.latest_score ?? 0;
            return (
              <li
                key={job.job_id}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 hover:bg-zinc-900/80"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-50">
                    {job.homeowner_name || "Unknown homeowner"}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {job.homeowner_email}
                  </span>
                  {job.homeowner_phone && (
                    <span className="text-[10px] text-zinc-600">
                      {job.homeowner_phone}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">Health</span>
                    <span className="text-sm font-semibold text-zinc-50">
                      {score}
                    </span>
                    <span className="text-[10px] text-zinc-500">/100</span>
                  </div>

                  <ContactActions
                    homeownerEmail={job.homeowner_email}
                    homeownerPhone={job.homeowner_phone}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const TodayActionListClient: React.FC<Props> = ({
  orgId,
  initialList,
}) => {
  const [list] = useState<TodayActionList>(initialList);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Section
        title="Call These Homeowners First"
        description="These HOT jobs have the highest chance to close. Start your day here."
        jobs={list.hotCalls}
        highlightEmoji="🔥"
      />

      <Section
        title="Send These Follow-Ups"
        description="These WARM jobs need one more nudge. A quick follow-up can turn them HOT."
        jobs={list.warmFollowUps}
        highlightEmoji="📩"
      />

      <Section
        title="Revive Cold Jobs (If You Have Time)"
        description="Optional: reach back out to recent COLD leads to see if anything has changed."
        jobs={list.coldRevives}
        highlightEmoji="❄️"
      />
    </div>
  );
};

