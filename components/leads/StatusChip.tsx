"use client";

import { StatusBadge } from "@/src/components/StatusBadge";

type LeadStatus = "new" | "queued" | "sending" | "sent" | "failed" | "replied" | "bounced" | string;

export default function StatusChip({ status }: { status: LeadStatus }) {
  return <StatusBadge status={status} />;
}


