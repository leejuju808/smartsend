// Block 24340 — Supplier Communication Engine
// Supplier Status Panel Component
// Shows real-time supplier communication status in job view

"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock, AlertCircle, Mail, MessageSquare, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupplierCommunication {
  id: string;
  communication_type: string;
  subject: string;
  status: string;
  sent_at: string;
  response_received_at: string | null;
  response_summary: string | null;
  created_at: string;
  suppliers: {
    id: string;
    name: string;
    email: string;
  };
}

interface SupplierStatusPanelProps {
  materialOrderId: string;
  jobId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SupplierStatusPanel({
  materialOrderId,
  jobId,
}: SupplierStatusPanelProps) {
  const { data, error, mutate } = useSWR<{ communications: SupplierCommunication[] }>(
    `/api/suppliers/communications?material_order_id=${materialOrderId}`,
    fetcher,
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );

  const communications = data?.communications || [];

  const getStatusIcon = (comm: SupplierCommunication) => {
    if (comm.response_received_at) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (comm.status === "failed" || comm.status === "bounced") {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusLabel = (comm: SupplierCommunication) => {
    if (comm.response_received_at) {
      return "Supplier Responded";
    }
    if (comm.status === "failed" || comm.status === "bounced") {
      return "Failed";
    }
    return "Awaiting Reply";
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      po_sent: "PO Sent",
      confirmation_request: "Confirmation Request",
      delivery_reminder: "Delivery Reminder",
      delivery_coordination: "Delivery Coordination",
      issue_resolution: "Issue Resolution",
      eta_update_request: "ETA Update Request",
    };
    return labels[type] || type;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "po_sent":
        return <Mail className="h-3.5 w-3.5" />;
      case "delivery_reminder":
        return <Clock className="h-3.5 w-3.5" />;
      case "issue_resolution":
        return <AlertCircle className="h-3.5 w-3.5" />;
      case "delivery_coordination":
        return <Package className="h-3.5 w-3.5" />;
      default:
        return <MessageSquare className="h-3.5 w-3.5" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">Error loading supplier communications</p>
      </div>
    );
  }

  if (communications.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Supplier Communication
          </h3>
        </div>
        <p className="text-xs text-zinc-400">
          No supplier communications yet. PO will be sent automatically when order is created.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Supplier Communication
        </h3>
      </div>

      <div className="space-y-3">
        {communications.map((comm) => (
          <div
            key={comm.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center justify-center w-6 h-6 rounded",
                  comm.response_received_at
                    ? "bg-green-500/20"
                    : comm.status === "failed" || comm.status === "bounced"
                    ? "bg-red-500/20"
                    : "bg-yellow-500/20"
                )}>
                  {getTypeIcon(comm.communication_type)}
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-200">
                    {getTypeLabel(comm.communication_type)}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {formatTime(comm.sent_at || comm.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {getStatusIcon(comm)}
                <span className="text-[10px] text-zinc-400">
                  {getStatusLabel(comm)}
                </span>
              </div>
            </div>

            {comm.response_summary && (
              <div className="mt-2 pt-2 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-400 mb-1">Supplier Response:</p>
                <p className="text-xs text-zinc-300">{comm.response_summary}</p>
              </div>
            )}

            {comm.subject && (
              <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">
                {comm.subject}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}






































