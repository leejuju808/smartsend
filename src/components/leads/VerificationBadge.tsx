"use client";

import { useState } from "react";

type VerificationStatus = "valid" | "risky" | "invalid" | "unknown" | null | undefined;

interface VerificationBadgeProps {
  status: VerificationStatus;
  reasons?: string[] | null;
}

export function VerificationBadge({ status, reasons }: VerificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!status || status === "unknown") {
    return null;
  }

  const colorMap = {
    valid: "bg-green-500",
    risky: "bg-yellow-500",
    invalid: "bg-red-500",
  };

  const labelMap = {
    valid: "Valid",
    risky: "Risky",
    invalid: "Invalid",
  };

  const reasonText = reasons && reasons.length > 0 
    ? reasons.join(", ").replace(/\b\w/g, l => l.toUpperCase())
    : status === "invalid" ? "Invalid email" : "May have delivery issues";

  return (
    <div className="relative inline-block">
      <div
        className={`w-2 h-2 rounded-full ${colorMap[status]} cursor-help`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute z-10 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap bottom-full left-1/2 transform -translate-x-1/2 mb-1">
          <div>{labelMap[status]}</div>
          {reasons && reasons.length > 0 && (
            <div className="text-xs opacity-90 mt-0.5">{reasonText}</div>
          )}
        </div>
      )}
    </div>
  );
}

