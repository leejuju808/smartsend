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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, value, reason })
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
      <div className="text-sm font-medium">Suppression list</div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] items-end">
        <div>
          <label className="text-xs text-gray-600">Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value as any)} className="mt-1 rounded-xl border p-2">
            <option value="email">Email</option>
            <option value="domain">Domain</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">Value</label>
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="user@example.com or example.com" className="mt-1 w-full rounded-xl border p-2" />
        </div>
        <div>
          <label className="text-xs text-gray-600">Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="bounce, complaint, manual" className="mt-1 w-full rounded-xl border p-2" />
        </div>
        <button onClick={add} className="rounded-2xl bg-black px-4 py-2 text-white">Add</button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2">Kind</th>
              <th className="p-2">Value</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.kind}</td>
                <td className="p-2 font-mono">{it.value_lower}</td>
                <td className="p-2">{it.reason || ""}</td>
                <td className="p-2">{new Date(it.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <button onClick={() => remove(it.id)} className="rounded-xl border px-3 py-1 text-xs">Remove</button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No suppressions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

