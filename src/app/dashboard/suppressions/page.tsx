"use client";
import { useEffect, useRef, useState } from "react";
import { useSubscription } from "@/lib/useSubscription";
import Link from "next/link";

export default function SuppressionsPage() {
  const { status, loading } = useSubscription();
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [reason, setReason] = useState("manual");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const r = await fetch("/api/suppressions");
    const j = await r.json();
    setItems(j.items || []);
  }

  async function uploadCsv() {
    const f = fileRef.current?.files?.[0];
    if (!f) return alert("Pick a CSV file");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("reason", reason);
    const r = await fetch("/api/suppressions/import", { method: "POST", body: fd });
    if (!r.ok) alert("Import failed");
    await refresh();
    setBusy(false);
  }

  if (loading) return <p className="p-10">Loading...</p>;
  if (status !== "pro" && status !== "active") {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold">Upgrade Required 🚀</h1>
        <p className="mt-4 text-gray-600">Suppression list is a Pro feature.</p>
        <Link href="/dashboard/billing" className="mt-6 inline-block px-6 py-3 rounded-xl bg-black text-white font-semibold hover:opacity-90">Upgrade to Pro</Link>
      </main>
    );
  }

  return (
    <main className="p-10 space-y-6">
      <h1 className="text-3xl font-bold">🚫 Suppression List</h1>
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="text-sm font-medium">Upload suppression CSV (email or domain)</div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="block w-full rounded-xl border p-2" onChange={e => setFileName(e.target.files?.[0]?.name || "")} />
        {fileName && <div className="text-xs text-gray-600">Selected: {fileName}</div>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs text-gray-600">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-xl border p-2">
              <option value="manual">manual</option>
              <option value="complaint">complaint</option>
              <option value="bounce">bounce</option>
            </select>
          </div>
          <button disabled={busy} onClick={uploadCsv} className="self-end rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">{busy ? "Importing…" : "Import"}</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <h2 className="text-xl font-semibold mb-4">Suppressed</h2>
        <table className="min-w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-2 border">Kind</th>
              <th className="px-4 py-2 border">Value</th>
              <th className="px-4 py-2 border">Reason</th>
              <th className="px-4 py-2 border">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border text-sm">{row.kind}</td>
                <td className="px-4 py-2 border text-sm">{row.value_lower}</td>
                <td className="px-4 py-2 border text-sm">{row.reason || '-'}</td>
                <td className="px-4 py-2 border text-sm">{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

