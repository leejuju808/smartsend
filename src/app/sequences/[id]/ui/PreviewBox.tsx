"use client";
import { useEffect, useState } from "react";

type Lead = { id:string; email:string; name?:string|null };

export default function PreviewBox({ sequenceId, userId, stepNo }:{
  sequenceId: string; userId: string; stepNo: number;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [rendered, setRendered] = useState<{subject:string; body:string; unresolved:boolean} | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/leads/list?userId=${userId}&limit=20`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(j => {
        setLeads(j.items || []);
        if (j.items?.[0]) setLeadId(j.items[0].id);
      })
      .catch(()=>{});
  }, [userId]);

  async function preview() {
    if (!leadId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sequences/${sequenceId}/preview?userId=${userId}`, {
        method:"POST", headers:{ "content-type":"application/json" },
        body: JSON.stringify({ step_no: stepNo, lead_id: leadId })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Preview failed");
      setRendered(j);
    } catch (e:any) {
      alert(e.message || String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Personalization Preview (Step {stepNo})</div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-xl px-2 py-1 text-sm"
            value={leadId} onChange={e=>setLeadId(e.target.value)}
          >
            {leads.map(l => <option key={l.id} value={l.id}>{l.email}</option>)}
          </select>
          <button onClick={preview} disabled={busy || !leadId} className="rounded-xl bg-black text-white px-3 py-1.5 text-sm">
            {busy ? "Rendering…" : "Preview"}
          </button>
        </div>
      </div>

      {rendered && (
        <div className="mt-3 grid gap-3">
          <div>
            <div className="text-xs text-gray-500">Subject</div>
            <div className="rounded-xl border px-3 py-2 bg-white">{rendered.subject || <em className="text-gray-400">empty</em>}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Body</div>
            <div className="rounded-xl border p-3 bg-white prose max-w-none" dangerouslySetInnerHTML={{ __html: rendered.body }} />
          </div>
          {rendered.unresolved && (
            <div className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
              Some tokens look unresolved (e.g., <code>{`{{variable}}`}</code>). Add fallbacks like <code>{`{{name|there}}`}</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

