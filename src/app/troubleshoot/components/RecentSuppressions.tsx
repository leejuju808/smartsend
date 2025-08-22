"use client";
import { useEffect, useState } from "react";

export default function RecentSuppressions({ userId }: { userId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/suppressions/list?userId=${userId}`)
      .then((r) => r.json())
      .then((j) => setRows(j.items || []))
      .catch(() => {});
  }, [userId]);
  if (!rows.length) return <div className="text-sm text-gray-600">No suppressions.</div>;
  return (
    <div className="mt-2 text-sm">
      <ul className="space-y-1">
        {rows.slice(0, 10).map((r, i) => (
          <li key={i} className="flex items-center justify-between">
            <span>{r.email}</span>
            <span className="text-xs text-gray-500">
              {r.reason} • {new Date(r.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

