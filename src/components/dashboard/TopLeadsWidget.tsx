"use client";
import { useEffect, useState } from "react";

interface Lead {
  lead_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  company?: string | null;
  priority: number;
  engagement_score?: number;
  intent_score?: number;
}

function Badge({ value }: { value: number }) {
  const label = value >= 70 ? 'HOT' : value >= 40 ? 'WARM' : 'COLD';
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${
      value >= 70 ? 'bg-red-600 text-white' : 
      value >= 40 ? 'bg-yellow-500 text-black' : 
      'bg-gray-300 text-black'
    }`}>
      {label} {value}
    </span>
  );
}

export default function TopLeadsWidget() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/leads/priority?limit=6', { cache: "no-store" });
        const j = await r.json();
        if (r.ok) {
          setRows(j.rows || []);
        }
      } catch (e) {
        console.error('Failed to load top leads:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-3">Top Leads</h3>
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-3">Top Leads</h3>
        <div className="text-sm text-gray-500">No leads with scores yet</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold mb-3">Top Leads</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.lead_id} className="border rounded p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">
                  {r.first_name ? `${r.first_name} ${r.last_name ?? ''}` : r.email}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.company ?? '—'}
                </div>
              </div>
              <Badge value={r.priority} />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Eng {Math.round(r.engagement_score ?? 0)} • Intent {Math.round(r.intent_score ?? 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

