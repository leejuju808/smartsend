"use client";

import React from "react";

export const HotJobsExportButton: React.FC = () => {
  return (
    <a
      href="/api/reports/hot-jobs"
      className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-900"
    >
      <span>⬇</span>
      <span>Download Hot Jobs (CSV)</span>
    </a>
  );
};




