"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Sender = {
  id: string;
  provider: string;
  email: string;
  display_name: string | null;
  daily_limit: number;
  created_at: string;
};

export default function SendersClient({ initialSenders }: { initialSenders: Sender[] }) {
  const [senders, setSenders] = useState(initialSenders);
  const router = useRouter();

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to disconnect this inbox?")) return;
    
    const res = await fetch(`/api/senders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSenders(senders.filter(s => s.id !== id));
    } else {
      alert("Failed to disconnect");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <a
          href="/api/auth/google/start"
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          Connect Gmail
        </a>
        <a
          href="/api/auth/microsoft/start"
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          Connect Outlook
        </a>
      </div>

      <div className="grid gap-3">
        {senders.length > 0 ? (
          senders.map((s) => (
            <div key={s.id} className="border rounded-2xl p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.display_name ?? s.email}</div>
                <div className="text-xs text-gray-500">
                  {s.provider} • {s.email} • Daily limit: {s.daily_limit}
                </div>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
              >
                Disconnect
              </button>
            </div>
          ))
        ) : (
          <div className="text-gray-500 text-sm">No senders connected yet.</div>
        )}
      </div>
    </div>
  );
}

