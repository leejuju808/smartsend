"use client";

import { useEffect, useMemo, useState } from "react";

export default function RepliesInbox() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Open");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string,boolean>>({});
  const [loading, setLoading] = useState(false);

  const project_id = typeof window !== "undefined" ? localStorage.getItem("project_id") || "" : "";

  const fetchRows = async () => {
    setLoading(true);
    const url = new URL("/api/replies/list", location.origin);
    url.searchParams.set("project_id", project_id);
    url.searchParams.set("q", q);
    url.searchParams.set("status", status === "All" ? "all" : status);
    url.searchParams.set("page", String(page));
    const r = await fetch(url);
    const j = await r.json();
    setRows(j.rows || []);
    setLoading(false);
    setSelected({});
  };
  useEffect(()=>{ fetchRows(); /* eslint-disable react-hooks/exhaustive-deps */ }, [q,status,page]);

  const allChecked = useMemo(() => rows.length && rows.every(r => selected[r.id]), [rows,selected]);
  const toggleAll = (checked:boolean)=> {
    const copy:Record<string,boolean> = {};
    if (checked) rows.forEach(r=>copy[r.id]=true);
    setSelected(copy);
  };
  const selectedIds = useMemo(()=> Object.keys(selected).filter(id=>selected[id]), [selected]);

  const bulk = async (action:string, assigned_to?:string) => {
    if (!selectedIds.length) return;
    const r = await fetch("/api/replies/bulk", { method:"POST", body: JSON.stringify({ ids:selectedIds, action, assigned_to }), headers: { "Content-Type": "application/json" } });
    const j = await r.json();
    if (j.ok) fetchRows(); else alert(j.error);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Replies Inbox</h1>
        <div className="flex items-center gap-2">
          <input className="h-9 w-64 rounded-md border px-3 text-sm" placeholder="Search replies…" value={q} onChange={e=>{setPage(1);setQ(e.target.value)}} />
          <select className="h-9 rounded-md border px-2 text-sm" value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}}>
            <option>Open</option>
            <option>Closed</option>
            <option>Ignored</option>
            <option>All</option>
          </select>
          <button className="rounded-xl border px-3 py-1.5 text-sm" onClick={()=>bulk("close")}>Close</button>
          <button className="rounded-xl border px-3 py-1.5 text-sm" onClick={()=>bulk("ignore")}>Ignore</button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-sm font-medium bg-muted">
          <div className="col-span-1"><input type="checkbox" checked={!!allChecked} onChange={e=>toggleAll(e.target.checked)} /></div>
          <div className="col-span-3">From</div>
          <div className="col-span-6">Body</div>
          <div className="col-span-2">Received</div>
        </div>

        {loading ? <div className="p-6 text-sm opacity-70">Loading…</div> :
        rows.length===0 ? <div className="p-6 text-sm opacity-70">No replies found.</div> :
        rows.map(r=>(
          <div key={r.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm">
            <div className="col-span-1"><input type="checkbox" checked={!!selected[r.id]} onChange={e=>setSelected(prev=>({...prev,[r.id]:e.target.checked}))} /></div>
            <div className="col-span-3 font-medium truncate">{r.from_email}</div>
            <div className="col-span-6 truncate">{r.body?.slice(0,120)}</div>
            <div className="col-span-2 opacity-70">{new Date(r.received_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

