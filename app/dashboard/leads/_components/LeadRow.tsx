// app/dashboard/leads/_components/LeadRow.tsx
"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type LeadStatus = "new" | "in_progress" | "won" | "lost";

type LeadRowType = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  notes: string | null;
  status: LeadStatus;
  source: string;
  created_at: string;
  updated_at: string;
  reply_id: string | null;
  estimated_value: number | null;
  currency: string;
};

interface Props {
  lead: LeadRowType;
}

function formatTimeAgo(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

function statusBadge(status: LeadStatus) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium";

  const map: Record<LeadStatus, string> = {
    new: "border-blue-600 bg-blue-500/10 text-blue-700",
    in_progress: "border-yellow-500 bg-yellow-500/10 text-yellow-700",
    won: "border-emerald-600 bg-emerald-500/10 text-emerald-700",
    lost: "border-gray-500 bg-gray-500/10 text-gray-400",
  };

  const labelMap: Record<LeadStatus, string> = {
    new: "New",
    in_progress: "In progress",
    won: "Won",
    lost: "Lost",
  };

  return (
    <span className={`${base} ${map[status]}`}>{labelMap[status]}</span>
  );
}

function formatCurrency(value: number | null | undefined, currency: string = "USD"): string {
  if (value == null || value === 0) {
    return "—";
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  });
}

export default function LeadRow({ lead }: Props) {
  const nameOrEmail = lead.name || lead.email || "Unknown contact";

  return (
    <article className="grid grid-cols-7 gap-2 px-4 py-2 text-xs hover:bg-muted/60">
      {/* Contact */}
      <div className="col-span-2 flex flex-col gap-[2px]">
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="text-xs font-medium underline-offset-2 hover:underline"
        >
          {nameOrEmail}
        </Link>
        {lead.email && (
          <span className="text-[11px] text-muted-foreground">
            {lead.email}
          </span>
        )}
      </div>

      {/* Subject */}
      <div className="flex items-center">
        {lead.subject ? (
          <span className="line-clamp-1 text-[11px]">{lead.subject}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">No subject</span>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center">{statusBadge(lead.status)}</div>

      {/* Source */}
      <div className="flex items-center text-[11px] text-muted-foreground">
        {lead.source === "email_reply" ? "Email reply" : lead.source}
        {lead.reply_id && (
          <Link
            href={`/dashboard/replies`}
            className="ml-2 underline-offset-2 hover:underline"
          >
            View reply
          </Link>
        )}
      </div>

      {/* Value */}
      <div className="flex items-center justify-end text-[11px] font-medium">
        {formatCurrency(lead.estimated_value, lead.currency)}
      </div>

      {/* Created */}
      <div className="flex items-center justify-end text-[11px] text-muted-foreground">
        {formatTimeAgo(lead.created_at)}
      </div>
    </article>
  );
}

