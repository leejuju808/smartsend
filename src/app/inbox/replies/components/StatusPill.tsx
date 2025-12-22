"use client";

import type { ReplyStatus } from "@/types/reply-inbox";

interface StatusPillProps {
  status: ReplyStatus;
}

const STATUS_COLORS: Record<ReplyStatus, string> = {
  open: "bg-green-100 text-green-800",
  snoozed: "bg-yellow-100 text-yellow-800",
  closed: "bg-gray-100 text-gray-800",
  archived: "bg-slate-100 text-slate-800",
};

export default function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}





























































