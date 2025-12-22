"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function SendLogs() {
  const { data } = useSWR("/api/logs?limit=50", fetcher, { refreshInterval: 5000 });

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="text-lg font-semibold mb-3">Send Logs</h3>
      <div className="max-h-80 overflow-auto text-sm">
        {(data?.logs ?? []).map((l: any) => (
          <div key={l.id} className="py-2 border-b">
            <div className="flex justify-between">
              <span>{l.to_email}</span>
              <span className={`uppercase ${l.status === "failed" ? "text-red-600" : "text-green-700"}`}>{l.status}</span>
            </div>
            <div className="text-xs opacity-70">{l.provider_id || "—"}</div>
            {l.error_text && <div className="text-xs text-red-600">{l.error_text}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}