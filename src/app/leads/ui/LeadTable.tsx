"use client";
import { useEffect, useMemo, useState } from "react";
import SequencePickerModal from "./SequencePickerModal";

type Lead = { id:string; email:string; name?:string|null; company?:string|null; tz?:string|null; unsubscribed?:boolean; created_at:string };

const COMMON_TZ = [
  "America/Los_Angeles","America/Denver","America/Chicago","America/New_York",
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome",
  "Asia/Singapore","Asia/Tokyo","Asia/Seoul","Asia/Kolkata",
  "Australia/Sydney"
];

export default function LeadTable({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [order, setOrder] = useState("created_at.desc");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [allOnPage, setAllOnPage] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const selectedIds = useMemo(() => Object.keys(sel).filter(id => sel[id]), [sel]);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ userId, q, limit: String(limit), offset: String(offset), order });
    const r = await fetch(`/api/leads/list?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return;
    setRows(j.items || []);
    setTotal(j.total || 0);
    setSel({});
    setAllOnPage(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId, q, limit, offset, order]);

  function toggleAllOnPage(v: boolean) {
    setAllOnPage(v);
    const next: Record<string, boolean> = {};
    if (v) rows.forEach(r => next[r.id] = true);
    setSel(next);
  }

  async function saveTz(id: string, tz: string) {
    const r = await fetch(`/api/leads/${id}/timezone?userId=${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tz })
    });
    if (!r.ok) alert("Invalid timezone"); else load();
  }

  return (
    <>
      <div className="rounded-2xl border p-4 bg-white grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Search email, name, company…"
            className="border rounded-xl px-3 py-2 flex-1 min-w-[220px]"
            value={q} onChange={e => { setQ(e.target.value); setOffset(0); }}
          />
          <select className="border rounded-xl px-2 py-2 text-sm" value={order} onChange={e=>setOrder(e.target.value)}>
            <option value="created_at.desc">Newest</option>
            <option value="created_at.asc">Oldest</option>
            <option value="email.asc">Email A–Z</option>
            <option value="email.desc">Email Z–A</option>
          </select>
          <div className="text-sm text-gray-600 ml-auto">
            {selectedIds.length ? `${selectedIds.length} selected` : `${total} total`}
          </div>
          <button
            disabled={!selectedIds.length}
            onClick={() => setShowPicker(true)}
            className="rounded-xl bg-black text-white px-3 py-2 text-sm"
          >
            Enroll to Sequence
          </button>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3"><input type="checkbox" checked={allOnPage} onChange={e=>toggleAllOnPage(e.target.checked)} /></th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Company</th>
                <th className="text-left p-3">Timezone</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="p-4 text-gray-500">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-gray-500">No leads. Import a CSV to get started.</td></tr>
              )}
              {!loading && rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <input type="checkbox" checked={!!sel[r.id]} onChange={e=>setSel({ ...sel, [r.id]: e.target.checked })} />
                  </td>
                  <td className="p-3 font-mono">{r.email}</td>
                  <td className="p-3">{r.name || <span className="text-gray-400">—</span>}</td>
                  <td className="p-3">{r.company || <span className="text-gray-400">—</span>}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={r.tz || ""}
                        placeholder="e.g. Europe/London"
                        className="border rounded px-2 py-1 w-44"
                        onBlur={e => e.target.value && saveTz(r.id, e.target.value)}
                      />
                      <select className="border rounded px-2 py-1"
                        onChange={e => saveTz(r.id, e.target.value)}
                        value=""
                      >
                        <option value="" disabled>Common TZ…</option>
                        {COMMON_TZ.map(tz => <option value={tz} key={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="p-3">
                    {r.unsubscribed ? <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Unsubscribed</span>
                                    : <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Active</span>}
                  </td>
                  <td className="p-3 text-right">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {rows.length ? offset + 1 : 0}–{Math.min(offset + rows.length, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button disabled={offset===0} onClick={()=>setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1.5 rounded-xl bg-gray-100">Prev</button>
            <button disabled={offset + limit >= total} onClick={()=>setOffset(offset + limit)}
              className="px-3 py-1.5 rounded-xl bg-gray-100">Next</button>
          </div>
        </div>
      </div>

      <SequencePickerModal
        open={showPicker}
        onClose={()=>setShowPicker(false)}
        userId={userId}
        selectedLeadIds={selectedIds}
        onEnrolled={() => { setShowPicker(false); setSel({}); }}
      />
    </>
  );
}
