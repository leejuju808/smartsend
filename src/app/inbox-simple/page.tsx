"use client";

import { useReplies } from "@/hooks/useReplies";

export default function InboxSimplePage() {
  const replies = useReplies();

  return (
    <div className="space-y-3">
      {replies.map((r) => (
        <div key={r.id} className="p-3 bg-neutral-900 rounded-xl border border-neutral-800">
          <p className="text-sm text-gray-400">{r.sender}</p>
          <p className="text-lg font-semibold">{r.subject}</p>
          <p className="text-gray-500">{r.snippet}</p>
          <p className="text-xs text-gray-600 mt-1">{new Date(r.received_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

