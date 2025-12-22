"use client";

import { retryQueueItem } from "./actions";
import { useState } from "react";
import Link from "next/link";

export default function InboxItem({ item, campaignId }: { item: any; campaignId: string }) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (!item.queue_id) return;
    setRetrying(true);
    try {
      await retryQueueItem(item.queue_id, campaignId);
      // Optionally refresh the page or update the item state
      window.location.reload();
    } catch (e: any) {
      alert(`Failed to retry: ${e.message}`);
    } finally {
      setRetrying(false);
    }
  }

  const statusColors: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-800",
    sending: "bg-blue-100 text-blue-800",
    sent: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <li className="p-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {item.lead_id ? (
            <Link
              href={`/campaigns/${campaignId}/lead/${item.lead_id}`}
              className="font-medium hover:underline"
            >
              {item.lead_email ?? item.to_email}
            </Link>
          ) : (
            <div className="font-medium">{item.lead_email ?? item.to_email}</div>
          )}
          <div className="text-sm opacity-80 truncate">{item.subject}</div>
          <div className="text-xs opacity-60">{new Date(item.scheduled_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColors[item.status] ?? "bg-gray-100 text-gray-800"}`}>
            {item.status}
          </span>
          {item.fail_code && (
            <span
              className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800"
              title={`Failure: ${item.fail_code} (${item.fail_kind})`}
            >
              {item.fail_code}
            </span>
          )}
          {item.status === "failed" && item.queue_id && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-xl border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {retrying ? "Retrying..." : "Retry"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

