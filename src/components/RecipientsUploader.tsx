"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

type Row = { email: string; name?: string | null };

export default function RecipientsUploader({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/recipients`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setExisting(json.data || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const handleSelect = (f: File) => {
    setMsg(null);
    setErr(null);
    Papa.parse<Row>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        // Expecting headers: email, name (optional)
        const parsed = (res.data || [])
          .map((r: any) => ({
            email: (r.email || "").toString().trim(),
            name: r.name ? r.name.toString().trim() : null,
          }))
          .filter((r) => r.email.length > 0);
        setRows(parsed);
      },
      error: (e) => setErr(e.message),
    });
  };

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);
  const numExisting = existing.length;

  async function upload() {
    if (rows.length === 0) return;
    setLoading(true);
    setMsg(null);
    setErr(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setMsg(`Inserted ${json.inserted}, skipped ${json.skipped}.`);
      setRows([]);
      await loadExisting();
      fileRef.current && (fileRef.current.value = "");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm("Delete ALL recipients from this campaign?")) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/recipients`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // no emails => delete all
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setMsg("All recipients deleted.");
      await loadExisting();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Recipients</h3>
        <span className="text-sm text-neutral-400">{numExisting} saved</span>
      </div>
      <p className="text-sm text-neutral-400 mt-1">
        Upload a CSV with headers: <code>email,name</code>. We validate, de-dupe, and store them.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSelect(f);
          }}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={loading || rows.length === 0}
          className="rounded-2xl bg-yellow-400/90 text-black font-semibold px-4 py-2 hover:bg-yellow-300 disabled:opacity-50"
        >
          {loading ? "Uploading…" : `Upload ${rows.length} contacts`}
        </button>
        <button
          onClick={clearAll}
          disabled={loading || numExisting === 0}
          className="rounded-2xl border border-red-500/60 text-red-400 font-semibold px-4 py-2 hover:bg-red-500/10 disabled:opacity-50"
        >
          Clear all
        </button>
        <a
          href={"data:text/csv;charset=utf-8," + encodeURIComponent("email,name\njane@acme.com,Jane Doe\n")}
          download="smartsend_recipients_template.csv"
          className="text-sm underline text-neutral-300"
        >
          Download CSV template
        </a>
      </div>

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-neutral-300 mb-2">Preview (first 10)</div>
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-neutral-800">Email</th>
                  <th className="text-left px-3 py-2 border-b border-neutral-800">Name</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="odd:bg-neutral-900/30">
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">{r.name ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-neutral-500 mt-2">
            Full file parsed: {rows.length} rows (duplicates filtered on upload).
          </div>
        </div>
      )}

      {msg && <div className="mt-3 text-green-400 text-sm">{msg}</div>}
      {err && <div className="mt-3 text-red-400 text-sm">Error: {err}</div>}
    </div>
  );
}