"use client";
import { useEffect, useState } from "react";

type Row = { id: string; kind: "email"|"domain"; value_lower: string; reason?: string; created_at: string };

export default function SuppressionManager() {
  const [items, setItems] = useState<Row[]>([]);
  const [kind, setKind] = useState<"email"|"domain">("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const r = await fetch("/api/suppressions");
    const j = await r.json();
    setItems(j.items || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!value.trim()) return;
    await fetch("/api/suppressions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, value: value.trim(), reason: reason.trim() || undefined })
    });
    setValue(""); setReason("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/suppressions/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="text-sm font-medium">Suppressions</div>
      <div className="grid sm:grid-cols-[120px_1fr_1fr_auto] gap-2 items-end">
        <select value={kind} onChange={e => setKind(e.target.value as any)} className="rounded-xl border p-2">
          <option value="email">email</option>
          <option value="domain">domain</option>
        </select>
        <input value={value} onChange={e => setValue(e.target.value)} placeholder={kind === "email" ? "name@example.com" : "example.com"} className="rounded-xl border p-2" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="reason (optional)" className="rounded-xl border p-2" />
        <button onClick={add} className="rounded-2xl bg-black px-4 py-2 text-white">Add</button>
      </div>

      <div className="rounded-xl border divide-y">
        {items.map(it => (
          <div key={it.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <span className="mr-2 text-xs px-2 py-0.5 rounded-full bg-gray-100">{it.kind}</span>
              <span className="font-medium">{it.value_lower}</span>
              {it.reason && <span className="ml-2 text-gray-500">— {it.reason}</span>}
            </div>
            <button onClick={() => remove(it.id)} className="text-xs text-red-600">Remove</button>
          </div>
        ))}
        {!items.length && <div className="p-3 text-sm text-gray-500">No suppressions yet.</div>}
      </div>
    </div>
  );
}

