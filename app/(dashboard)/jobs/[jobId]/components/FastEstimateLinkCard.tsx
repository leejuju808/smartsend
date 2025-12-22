"use client";

import React, { useState } from "react";

type Props = {
  fastEstimateUrl: string | null;
};

export const FastEstimateLinkCard: React.FC<Props> = ({ fastEstimateUrl }) => {
  const [copied, setCopied] = useState(false);

  if (!fastEstimateUrl) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
        Add a Fast Estimate booking link in your settings so you can share it with
        homeowners and let them pick a time in one click.
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fastEstimateUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("copy failed", err);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Fast Estimate Link
      </p>
      <p className="mt-1 text-[11px] text-zinc-400">
        Share this link in texts or emails so the homeowner can book a roof estimate
        without back-and-forth.
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-zinc-300">
          {fastEstimateUrl}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-xl bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-900 hover:bg-zinc-200"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
};















































