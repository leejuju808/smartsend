"use client";
import { useEffect, useState } from "react";

export default function DomainNudge() {
  const [d,setD] = useState<{domain:string; users_30d:number} | null>(null);
  const [busy,setBusy] = useState(false);
  const [msg,setMsg] = useState("");

  useEffect(() => {
    fetch("/api/domains/suggest").then(r=>r.json()).then(j=>{
      if (j?.domains?.[0]) setD(j.domains[0]);
    }).catch(()=>{});
  }, []);

  if (!d) return null;

  async function claim() {
    if (!d) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/domains/claim", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ domain: d.domain })
    });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? j.instructions : (j.error || "Error"));
  }

  return (
    <div className="bg-indigo-50 border-b border-indigo-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="text-indigo-900 text-sm">
        We noticed <b>{d.users_30d}</b> teammates from <b>{d.domain}</b>. <b>Claim your domain</b> to auto-join new coworkers and sync seats.
      </div>
      <div className="flex gap-2">
        <button onClick={claim} disabled={busy} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">
          {busy ? "Preparing…" : "Claim domain"}
        </button>
        <a href="/dashboard/team" className="px-3 py-2 rounded border text-sm">Manage team</a>
      </div>
      {!!msg && <div className="w-full text-xs text-indigo-800 mt-2">{msg}</div>}
    </div>
  );
} 