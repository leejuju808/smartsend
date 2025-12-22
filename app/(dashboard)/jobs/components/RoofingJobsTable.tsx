"use client";

import React from "react";
import Link from "next/link";
import type { RoofingJobRow } from "../_lib/fetchRoofingJobs";
import { HeatBar } from "../../components/HeatBar";
import { ContactActions } from "@/app/components/ContactActions";
import { JobRiskBadge } from "./JobRiskBadge";

type Props = {
  jobs: RoofingJobRow[];
};

function badgeClasses(bucket: RoofingJobRow["score_bucket"]) {
  if (bucket === "hot") {
    return "bg-red-500/10 text-red-300 border border-red-500/40";
  }
  if (bucket === "warm") {
    return "bg-amber-500/10 text-amber-300 border border-amber-500/40";
  }
  return "bg-zinc-800 text-zinc-200 border border-zinc-700";
}

function labelForBucket(bucket: RoofingJobRow["score_bucket"]) {
  if (bucket === "hot") return "Hot";
  if (bucket === "warm") return "Warm";
  return "Cold";
}

export const RoofingJobsTable: React.FC<Props> = ({ jobs }) => {
  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        No jobs yet. Once SmartSend starts reaching out to homeowners, new roofing
        jobs will appear here with a Health Score so you can see who's most ready to book.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950/70">
          <tr className="text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3">Homeowner</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500">
                Health
                <span className="text-rose-400">🔥</span>
              </div>
            </th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const score = job.latest_score ?? 0;
            const bucket = job.score_bucket ?? "cold";
            const isCompleted = (job.status || "").toLowerCase() === "completed";
            const awaiting = Number(job.cash_awaiting_payment_amount || 0);
            const days = job.cash_days_until_expected;
            const isStalled = Boolean(job.cash_is_stalled);

            return (
              <tr
                key={job.job_id}
                className="border-t border-zinc-800/60 hover:bg-zinc-900/60"
              >
                <td className="px-4 py-3">
                  <Link href={`/jobs/${job.job_id}`} className="block">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-50 hover:text-zinc-200">
                        {job.homeowner_name || "Unknown homeowner"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {job.homeowner_email}
                      </span>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">
                  <div className="flex flex-col">
                    <span>{job.status || "New"}</span>
                    {isCompleted && awaiting > 0 ? (
                      <span className="mt-1 text-[11px] text-zinc-500">
                        {isStalled
                          ? "Completed work awaiting payment."
                          : `Cash expected in ~${Math.max(0, Number(days ?? 0))} days.`}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 w-48">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${badgeClasses(
                        bucket
                      )}`}
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-current" />
                      {labelForBucket(bucket)}
                    </span>
                    <span className="text-sm font-semibold text-zinc-50">
                      {score}
                    </span>
                    <span className="text-[10px] text-zinc-500">/100</span>
                  </div>
                  {/* Heat bar */}
                  <HeatBar score={score} />
                </td>
                <td className="px-4 py-3">
                  <JobRiskBadge jobId={job.job_id} />
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <ContactActions
                    homeownerEmail={job.homeowner_email}
                    homeownerPhone={job.homeowner_phone}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

