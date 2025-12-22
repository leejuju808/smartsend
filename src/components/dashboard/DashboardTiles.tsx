"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardTiles({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, error } = useSWR(
    `/api/dashboard/metrics?workspace_id=${workspaceId}`,
    fetcher,
    { refreshInterval: 15000 } // live feel
  );

  const totals = data?.totals || { queued: 0, sent: 0, failed: 0, replied: 0 };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Queued", value: totals.queued },
        { label: "Sent", value: totals.sent },
        { label: "Failed", value: totals.failed },
        { label: "Replied", value: totals.replied },
      ].map((t) => (
        <div key={t.label} className="rounded-2xl border shadow-sm p-4 bg-white">
          <div className="text-sm text-gray-500">{t.label}</div>
          <div className="text-2xl font-semibold mt-1">
            {isLoading ? "—" : t.value}
          </div>
          {error && <div className="text-xs text-red-600 mt-1">Error</div>}
        </div>
      ))}
    </div>
  );
} 