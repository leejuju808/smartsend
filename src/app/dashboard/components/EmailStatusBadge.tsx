"use client";
import React from "react";

type Props = {
  status: "queued" | "sent" | "delivered" | "opened" | "replied" | "failed" | "skipped_suppressed" | "clicked" | null;
  opened?: boolean;
  clicked?: boolean;
};

const badgeStyles: Record<string, string> = {
  queued: "bg-gray-500 text-white",
  sent: "bg-blue-500 text-white",
  delivered: "bg-green-500 text-white",
  opened: "bg-green-600 text-white",
  clicked: "bg-purple-500 text-white",
  replied: "bg-yellow-500 text-black",
  failed: "bg-red-500 text-white",
  skipped_suppressed: "bg-orange-500 text-white",
};

// Optional: tiny intent pill beside "Replied"
export function ReplyIntent({ intent }: { intent?: string | null }) {
  if (!intent) return null;
  return (
    <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-black/40 border border-yellow-300/40">
      {intent}
    </span>
  );
}

export default function EmailStatusBadge({ status, opened, clicked }: Props) {
  if (!status) return null;
  
  // Determine the display status based on tracking fields
  let displayStatus = status;
  if (clicked) {
    displayStatus = "clicked";
  } else if (opened) {
    displayStatus = "opened";
  }
  
  const label = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1).replace('_', ' ');
  
  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${badgeStyles[displayStatus] || "bg-gray-600 text-white"}`}>
      {label}
    </span>
  );
}