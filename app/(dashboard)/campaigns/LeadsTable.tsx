'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/checkbox';
// Simple toast implementation
const toast = {
  error: (msg: string) => alert(`Error: ${msg}`),
  success: (msg: string) => alert(`Success: ${msg}`),
};

type Lead = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  status: 'queued'|'sending'|'sent'|'failed'|'replied';
  attempts: number;
  max_attempts: number;
};

export default function LeadsTable({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function fetchRows() {
    setLoading(true);
    const res = await fetch(`/api/leads?campaign_id=${campaignId}`);
    const data = await res.json();
    setRows(data.rows || []);
    setLoading(false);
  }
  useEffect(() => { fetchRows(); }, [campaignId]);

  const allChecked = useMemo(() => rows.length && rows.every(r => selected[r.id]);, [rows, selected]);
  const anyChecked = useMemo(() => Object.values(selected).some(Boolean), [selected]);
  const selectedIds = useMemo(() => Object.entries(selected).filter(([,v])=>v).map(([k])=>k), [selected]);

  function toggleAll(v:boolean) {
    const next: Record<string, boolean> = {};
    if (v) rows.forEach(r => next[r.id] = true);
    setSelected(next);
  }

  async function retrySelected() {
    try {
      const eligible = rows.filter(r => selected[r.id] && r.status === 'failed' && r.attempts < r.max_attempts).map(r => r.id);
      if (!eligible.length) return;
      const res = await fetch('/api/retry-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, lead_ids: eligible })
      });
      if (!res.ok) throw new Error('Retry failed');
      toast.success(`${eligible.length} failures re-enqueued`);
      await fetchRows();
      setSelected({});
    } catch (e:any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="border rounded">
      {/* Selection Toolbar */}
      {anyChecked && (
        <div className="flex items-center gap-2 p-2 border-b sticky top-0 bg-white z-10">
          <Button onClick={retrySelected} disabled={!rows.some(r => selected[r.id] && r.status==='failed' && r.attempts < r.max_attempts)}>Retry Failed</Button>
          <Button variant="secondary" onClick={()=>setSelected({})}>Cancel</Button>
          <div className="text-sm text-muted-foreground">{selectedIds.length} selected</div>
        </div>
      )}

      {/* Table */}
      <table className="w-full text-sm">
        <thead className="sticky top-[42px] bg-white">
          <tr>
            <th className="p-2 border-b"><Checkbox checked={!!allChecked} onCheckedChange={(v)=>toggleAll(!!v)} /></th>
            <th className="p-2 border-b text-left">Email</th>
            <th className="p-2 border-b text-left">Name</th>
            <th className="p-2 border-b text-left">Company</th>
            <th className="p-2 border-b">Status</th>
            <th className="p-2 border-b">Attempts</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td className="p-4" colSpan={6}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>No leads yet.</td></tr>
          ) : (
            rows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="p-2 border-b"><Checkbox checked={!!selected[r.id]} onCheckedChange={(v)=>setSelected(s=>({ ...s, [r.id]: !!v }))} /></td>
                <td className="p-2 border-b">{r.email}</td>
                <td className="p-2 border-b">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</td>
                <td className="p-2 border-b">{r.company}</td>
                <td className="p-2 border-b text-center">{r.status}</td>
                <td className="p-2 border-b text-center">{r.attempts}/{r.max_attempts}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

