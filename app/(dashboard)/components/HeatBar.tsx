"use client";

import React from "react";

type Props = {
  score: number; // 0–100
};

export const HeatBar: React.FC<Props> = ({ score }) => {
  // Red (hot) to amber (warm) to grey (cold)
  const pct = Math.min(Math.max(score, 0), 100);

  const gradient = `
    linear-gradient(
      to right,
      rgba(255, 59, 48, 1) 0%,
      rgba(255, 159, 10, 1) 50%,
      rgba(99, 99, 102, 1) 100%
    )
  `;

  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-900">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: gradient,
        }}
      />
    </div>
  );
};















































