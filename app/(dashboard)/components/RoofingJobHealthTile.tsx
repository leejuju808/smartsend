"use client";

import React from "react";
import type { RoofingHealthSnapshot } from "../_lib/fetchRoofingJobHealthSnapshot";

type Props = {
  snapshot: RoofingHealthSnapshot | null;
  isLoading?: boolean;
};

function HealthInfoTooltip() {
  return (
    <div className="group relative inline-flex items-center">
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300"
      >
        i
      </button>
      <div className="pointer-events-none absolute right-0 top-6 z-20 hidden w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300 shadow-xl group-hover:block">
        <p className="font-semibold text-zinc-50">
          What is Roofing Job Health?
        </p>
        <p className="mt-1">
          It's a 0–100 score for how likely a homeowner is to book a roofing job
          with you.
        </p>
        <ul className="mt-2 list-disc pl-4">
          <li>Opens + clicks</li>
          <li>Replies + intent</li>
          <li>Follow-ups</li>
          <li>How fast they respond</li>
        </ul>
        <p className="mt-2 text-[10px] text-zinc-400">
          Use this to call HOT jobs first so you close more estimates with less time.
        </p>
      </div>
    </div>
  );
}

function labelForScore(score: number): { label: string; description: string } {
  if (score >= 75) {
    return {
      label: "Pipeline is HOT",
      description: "You have jobs ready to be closed. Call these homeowners now.",
    };
  }
  if (score >= 40) {
    return {
      label: "Pipeline is WARM",
      description: "Good opportunities in play. Follow up to push them over the line.",
    };
  }
  return {
    label: "Pipeline is COLD",
    description: "Few high-intent jobs right now. Send more outreach.",
  };
}

export const RoofingJobHealthTile: React.FC<Props> = ({ snapshot, isLoading }) => {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5">
        <div className="mb-3 h-4 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="mb-4 h-8 w-20 animate-pulse rounded bg-zinc-800" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-10 rounded bg-zinc-900" />
          <div className="h-10 rounded bg-zinc-900" />
          <div className="h-10 rounded bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Roofing Job Health
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          No job data yet. Once SmartSend starts sending outreach for your roofing jobs,
          we'll show you how healthy your pipeline is here.
        </p>
      </div>
    );
  }

  const { avgScore, hotCount, warmCount, coldCount, lastUpdated } = snapshot;
  const label = labelForScore(avgScore);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Roofing Job Health
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-zinc-50">
              {avgScore}
            </span>
            <span className="text-xs text-zinc-500">/ 100</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200">
            {label.label}
          </div>
          <HealthInfoTooltip />
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        {label.description}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-zinc-900 px-3 py-2">
          <p className="text-zinc-500">Hot jobs</p>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{hotCount}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 px-3 py-2">
          <p className="text-zinc-500">Warm jobs</p>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{warmCount}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 px-3 py-2">
          <p className="text-zinc-500">Cold jobs</p>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{coldCount}</p>
        </div>
      </div>

      {lastUpdated && (
        <p className="mt-3 text-[10px] text-zinc-500">
          Last updated {new Date(lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  );
};

