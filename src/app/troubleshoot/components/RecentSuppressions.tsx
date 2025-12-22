"use client";
import { useEffect, useState } from "react";

export default function RecentSuppressions({ userId }: { userId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams({ scope: "account", account_id: userId });
    fetch(`/api/suppressions/list?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) ? setRows(j) : setRows([]))
      .catch(() => {});
  }, [userId]);
  if (!rows.length) return <div className="text-sm text-gray-600">No suppressions.</div>;
  return (
    <div className="mt-2 text-sm">
      <ul className="space-y-1">
        {rows.slice(0, 10).map((r, i) => (
          <li key={i} className="flex items-center justify-between">
            <span>
              {r.value}
              <span className="ml-2 text-xs uppercase text-gray-400">{r.kind}</span>
            </span>
            <span className="text-xs text-gray-500">
              {(r.reason || "manual")} • {new Date(r.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

