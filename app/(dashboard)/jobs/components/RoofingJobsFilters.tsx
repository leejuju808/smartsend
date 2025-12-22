"use client";

import React from "react";

type Props = {
  activeFilter: "all" | "hot" | "warm" | "cold";
  onChange: (value: "all" | "hot" | "warm" | "cold") => void;
};

export const RoofingJobsFilters: React.FC<Props> = ({
  activeFilter,
  onChange,
}) => {
  const btn = (key: "all" | "hot" | "warm" | "cold", label: string) => {
    const active = activeFilter === key;
    return (
      <button
        onClick={() => onChange(key)}
        className={`rounded-xl px-3 py-1 text-xs font-medium transition ${
          active
            ? "bg-zinc-50 text-zinc-900"
            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {btn("all", "All")}
      {btn("hot", "🔥 Hot")}
      {btn("warm", "Warm")}
      {btn("cold", "Cold")}
    </div>
  );
};















































