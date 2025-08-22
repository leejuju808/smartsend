"use client";
import { useEffect, useState } from "react";

type Item = {
  id: string; name: string; status: string; created_at: string;
  sent: number; open: number; reply: number;
};

export default function SequencesTable({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/sequences/list?userId=${userId}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed");
      setItems(j.items || []);
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  async function setStatus(id: string, status: string) {
    const prev = items.slice();
    setItems(items.map(it => it.id === id ? { ...it, status } : it)); // optimistic
    try {
      const r = await fetch(`/api/sequences/${id}/status?userId=${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) {
      setItems(prev); // rollback
      console.error(e);
    }
  }

  const Badge = ({ s }: { s: string }) => {
    const map: Record<string, string> = {
      running: "bg-green-100 text-green-700",
      paused: "bg-yellow-100 text-yellow-800",
      draft: "bg-gray-100 text-gray-700",
      completed: "bg-blue-100 text-blue-700",
      demo: "bg-purple-100 text-purple-700",
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${map[s] || "bg-gray-100 text-gray-700"}`}>{s}</span>;
  };

  if (loading) return <div className="p-4 rounded-2xl border bg-white">Loading…</div>;
  if (err) return <div className="text-red-600 text-sm">{err}</div>;
  if (!items.length) return <div className="text-sm text-gray-600">No sequences yet.</div>;

  return (
    <div className="rounded-2xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Status</th>
            <th className="text-right p-3">Sent</th>
            <th className="text-right p-3">Opened</th>
            <th className="text-right p-3">Replied</th>
            <th className="text-right p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} className="border-t">
              <td className="p-3">
                <a href={`/sequences/${it.id}`} className="font-medium hover:underline">{it.name}</a>
                <div className="text-xs text-gray-500">{new Date(it.created_at).toLocaleString()}</div>
              </td>
              <td className="p-3"><Badge s={it.status} /></td>
              <td className="p-3 text-right">{it.sent}</td>
              <td className="p-3 text-right">{it.open}</td>
              <td className="p-3 text-right">{it.reply}</td>
              <td className="p-3 text-right">
                {it.status === "running" && (
                  <button onClick={() => setStatus(it.id, "paused")} className="rounded-xl bg-yellow-600 text-white px-3 py-1.5">Pause</button>
                )}
                {it.status === "paused" && (
                  <button onClick={() => setStatus(it.id, "running")} className="rounded-xl bg-green-700 text-white px-3 py-1.5">Resume</button>
                )}
                {it.status === "draft" && (
                  <button onClick={() => setStatus(it.id, "running")} className="rounded-xl bg-black text-white px-3 py-1.5">Start</button>
                )}
                {it.status === "demo" && (
                  <button onClick={() => setStatus(it.id, "paused")} className="rounded-xl bg-purple-700 text-white px-3 py-1.5">Pause Demo</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

