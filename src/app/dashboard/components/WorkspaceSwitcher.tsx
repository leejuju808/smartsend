// /app/dashboard/components/WorkspaceSwitcher.tsx (minimal UI)
"use client";
import { useState } from "react";

export function WorkspaceSwitcher({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [wid, setWid] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">Workspace</label>
      <select
        className="rounded-lg border px-2 py-1"
        value={wid ?? ""}
        onChange={async (e) => {
          const next = e.target.value;
          setWid(next);
          // Persist cookie to inform API routes
          await fetch("/api/workspace/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace_id: next }),
          });
        }}
      >
        {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </div>
  );
}