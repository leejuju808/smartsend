"use client";
import { useEffect, useState } from "react";

type S = { email: string; reason?: string };

export default function SuppressionPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<S[]>([]);

  useEffect(() => {
    fetch("/api/contacts/suppression")
      .then(r => r.json()).then(j => setRows(j.rows || []))
      .catch(() => {});
  }, []);

  async function add() {
    const r = await fetch("/api/contacts/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reason }),
    });
    const j = await r.json();
    if (r.ok) setRows(j.rows || []);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Suppression List</h1>
      <div className="flex gap-2">
        <input className="border p-2 flex-1" placeholder="email@domain.com" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="border p-2 flex-1" placeholder="reason (optional)" value={reason} onChange={e=>setReason(e.target.value)} />
        <button onClick={add} className="px-3 py-2 bg-black text-white rounded">Add</button>
      </div>
      <ul className="mt-4 space-y-1">
        {rows.map((r,i)=>(<li key={i} className="text-sm">{r.email} {r.reason ? `— ${r.reason}`:""}</li>))}
      </ul>
    </div>
  );
} 