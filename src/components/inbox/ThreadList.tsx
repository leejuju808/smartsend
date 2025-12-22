"use client";

import { useEffect, useState } from "react";
import { BulkBar } from "./BulkBar";

type Thread = {
  id: string;
  subject: string | null;
  last_ai_label: string | null;
  status: string;
  updated_at: string;
  assigned_to: string | null;
  campaign_id?: string | null;
  last_message_at?: string | null;
};

export function ThreadList({ 
  initial, 
  campaignId,
  onThreadClick
}: { 
  initial: Thread[]; 
  campaignId?: string | null;
  onThreadClick?: (threadId: string) => void;
}) {
  const [rows, setRows] = useState<Thread[]>(initial);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selected = Object.keys(sel).filter(id => sel[id]);

  useEffect(() => { 
    setRows(initial); 
    setSel({}); 
  }, [initial]);

  function toggle(id: string, v: boolean) {
    setSel(s => ({ ...s, [id]: v }));
  }
  
  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.id] = v;
    setSel(next);
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <BulkBar 
          selected={selected} 
          campaignId={campaignId || undefined}
          onDone={() => {
            setSel({});
            // Refresh will be handled by parent component if needed
            window.location.reload();
          }} 
        />
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-2 py-2 w-8">
                <input 
                  type="checkbox"
                  checked={selected.length === rows.length && rows.length > 0}
                  onChange={e => toggleAll(e.target.checked)} 
                />
              </th>
              <th className="text-left px-2 py-2">Subject</th>
              <th className="text-left px-2 py-2">Label</th>
              <th className="text-left px-2 py-2">Status</th>
              <th className="text-left px-2 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr 
                key={r.id} 
                className="border-t cursor-pointer hover:bg-muted"
                onClick={() => onThreadClick?.(r.id)}
              >
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    checked={!!sel[r.id]} 
                    onChange={e => toggle(r.id, e.target.checked)} 
                  />
                </td>
                <td className="px-2 py-2 truncate">{r.subject || "(no subject)"}</td>
                <td className="px-2 py-2">{r.last_ai_label || "-"}</td>
                <td className="px-2 py-2">{r.status}</td>
                <td className="px-2 py-2">
                  {new Date(r.last_message_at || r.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

