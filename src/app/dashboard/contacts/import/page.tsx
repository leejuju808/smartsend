"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

type NDJSONMsg =
  | { type: "start"; filename: string; total: number; import_id: string; mapping: any }
  | { type: "progress"; processed: number; total: number }
  | { type: "log"; message: string }
  | { type: "summary"; filename: string; import_id: string; stats: any }
  | { type: "error"; message: string };

const guess = (headers: string[], names: string[]) =>
  headers.find((h) => names.includes(h.toLowerCase())) ?? "";

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [emailKey, setEmailKey] = useState("");
  const [firstKey, setFirstKey] = useState("");
  const [lastKey, setLastKey] = useState("");
  const [companyKey, setCompanyKey] = useState("");

  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const percent = useMemo(() => {
    if (!progress) return 0;
    return Math.min(100, Math.round((100 * progress.processed) / Math.max(1, progress.total)));
  }, [progress]);

  async function handlePick() {
    setHeaders([]); setPreview([]); setSummary(null); setLogs([]); setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const text = await file.text();

    const parsed = Papa.parse<Record<string, string>>(text, { header: true, preview: 10, skipEmptyLines: true });
    const h = (parsed.meta.fields || []).map((f: string) => (f || "").toLowerCase());
    setHeaders(h);

    const rows = (parsed.data || []).slice(0, 5).map((r: Record<string, string>) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(r)) o[k.toLowerCase()] = (r as any)[k] ?? "";
      return o;
    });
    setPreview(rows);

    // Auto-map
    setEmailKey(guess(h, ["email", "e-mail", "work email", "business email"]) || "email");
    setFirstKey(guess(h, ["first_name", "firstname", "first"]) || "first_name");
    setLastKey(guess(h, ["last_name", "lastname", "last"]) || "last_name");
    setCompanyKey(guess(h, ["company", "org", "organization"]) || "company");
  }

  async function startImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setLogs([]); setSummary(null); setError(null); setProgress(null); setImportId(null);

    const file = fileRef.current?.files?.[0];
    if (!file) { setBusy(false); return; }

    const form = new FormData();
    form.append("file", file);
    form.append("emailKey", emailKey);
    form.append("firstKey", firstKey);
    form.append("lastKey", lastKey);
    form.append("companyKey", companyKey);

    try {
      const res = await fetch("/api/import/stream", { method: "POST", body: form });
      if (!res.body) {
        const text = await res.text();
        throw new Error(text || "No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        for (const line of parts) {
          if (!line.trim()) continue;
          let msg: NDJSONMsg | null = null;
          try { msg = JSON.parse(line); } catch { continue; }

          if (msg && msg.type === "start") {
            setImportId(msg.import_id);
            setLogs((x) => [...x, `Started ${msg.filename} (total ${msg.total})`]);
          } else if (msg && msg.type === "progress") {
            setProgress({ processed: msg.processed, total: msg.total });
          } else if (msg && msg.type === "log") {
            setLogs((x) => [...x, msg.message]);
          } else if (msg && msg.type === "summary") {
            setSummary({ ...msg });
            setProgress({ processed: msg.stats.processed, total: msg.stats.total });
            setLogs((x) => [...x, "Done"]);
          } else if (msg && msg.type === "error") {
            setError(msg.message);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Import Contacts (CSV)</h1>
      <p className="text-sm text-gray-600">
        1) Choose your CSV → 2) Map headers → 3) Import with live progress. We'll de-dupe within the file and skip suppressed emails.
      </p>

      <form onSubmit={startImport} className="space-y-4 border rounded-2xl p-4">
        <input
          ref={fileRef}
          onChange={handlePick}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm"
          required
        />

        {headers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Email column</label>
              <select value={emailKey} onChange={(e) => setEmailKey(e.target.value)} className="w-full border rounded-xl p-2 text-sm">
                {[emailKey, ...headers.filter((h) => h !== emailKey)].map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">First name</label>
              <select value={firstKey} onChange={(e) => setFirstKey(e.target.value)} className="w-full border rounded-xl p-2 text-sm">
                {[firstKey, ...headers.filter((h) => h !== firstKey)].map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Last name</label>
              <select value={lastKey} onChange={(e) => setLastKey(e.target.value)} className="w-full border rounded-xl p-2 text-sm">
                {[lastKey, ...headers.filter((h) => h !== lastKey)].map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Company</label>
              <select value={companyKey} onChange={(e) => setCompanyKey(e.target.value)} className="w-full border rounded-xl p-2 text-sm">
                {[companyKey, ...headers.filter((h) => h !== companyKey)].map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="border rounded-2xl p-3 overflow-auto">
            <div className="text-sm font-medium mb-2">Preview (first 5 rows)</div>
            <table className="min-w-full text-sm">
              <thead>
                <tr>{headers.map((h) => <th key={h} className="text-left p-1 border-b">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b">
                    {headers.map((h) => <td key={h} className="p-1">{r[h] ?? ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !headers.length}
          className="px-4 py-2 rounded-2xl shadow text-white bg-black disabled:opacity-50"
        >
          {busy ? "Importing…" : "Start Import"}
        </button>
      </form>

      {progress && (
        <div className="w-full bg-gray-100 rounded-xl">
          <div
            className="h-3 rounded-xl"
            style={{ width: `${percent}%`, background: "black" }}
            aria-label="progress"
          />
          <div className="text-xs mt-1 text-gray-600">{progress.processed} / {progress.total} ({percent}%)</div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold mb-1">Logs</div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {logs.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border p-3 text-red-600 text-sm">Error: {error}</div>
      )}

      {summary && (
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="text-lg font-semibold">Import Summary</div>
          <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(summary, null, 2)}</pre>
          {importId && (
            <a
              className="inline-block px-4 py-2 rounded-2xl shadow text-white bg-black"
              href={`/api/import/rejects?import_id=${importId}`}
            >
              Download rejects CSV
            </a>
          )}
        </div>
      )}
    </div>
  );
} 