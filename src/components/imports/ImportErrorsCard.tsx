"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Item = {
  name: string;
  path: string;
  size: number;
  created_at: string;
  publicUrl: string | null;
};

function kb(bytes: number) {
  if (!bytes) return "0 KB";
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ImportErrorsCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/import-errors");
      const j = await r.json();
      setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function remove(path: string) {
    const ok = confirm("Delete this error file?");
    if (!ok) return;
    await fetch("/api/import-errors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Recent Import Errors</h3>
        <Button variant="ghost" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {loading && <div className="text-sm">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="text-sm opacity-70">No error CSVs found. Imports clean ✔️</div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">File</th>
                <th className="text-left p-2">Created</th>
                <th className="text-left p-2">Size</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.path} className="border-b last:border-0">
                  <td className="p-2">{it.name}</td>
                  <td className="p-2 whitespace-nowrap">
                    {new Date(it.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">{kb(it.size)}</td>
                  <td className="p-2 flex gap-2">
                    {it.publicUrl ? (
                      <a className="underline" href={it.publicUrl} target="_blank" rel="noreferrer">
                        Download
                      </a>
                    ) : (
                      <span className="opacity-60">No public URL</span>
                    )}
                    <button className="text-red-600 underline" onClick={() => remove(it.path)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/*
Storage notes:
- Ensure a Supabase Storage bucket named `imports` exists.
- If you prefer private files, replace getPublicUrl with createSignedUrl
  on a dedicated endpoint and render a time-limited link instead.
- This viewer assumes importer uploads as `errors_<timestamp>.csv`.
*/


