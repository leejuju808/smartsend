"use client";

import { useCallback, useMemo, useState } from "react";
import Papa from "papaparse";

type RawRow = Record<string, string>;
type MappedRow = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
};

type PreviewResult = {
  stats: {
    total_rows: number;
    invalid_email: number;
    duplicates_in_file: number;
    suppressed: number;
    existing_contacts: number;
    to_insert: number;
    to_update: number;
  };
  normalized: MappedRow[];
  classified: {
    invalid: number[];
    dupesInFile: number[];
    suppressed: number[];
    existing: number[];
    toInsert: number[];
    toUpdate: number[];
  };
};

const CANONICAL_FIELDS = [
  "email",
  "first_name",
  "last_name",
  "company",
  "title",
  "phone",
] as const;

export default function ContactsImportPage() {
  const [csvName, setCsvName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitOk, setCommitOk] = useState<null | string>(null);
  const [commitErr, setCommitErr] = useState<null | string>(null);

  const onDrop = useCallback((file: File) => {
    setCsvName(file.name);
    setPreview(null);
    setCommitOk(null);
    setCommitErr(null);

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        const data = res.data as RawRow[];
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(data);
        // Auto-map guess
        const auto: Record<string, string> = {};
        const lower = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        for (const h of hdrs) {
          const l = lower(h);
          if (l.includes("email")) auto[h] = "email";
          else if (l === "firstname" || l === "first") auto[h] = "first_name";
          else if (l === "lastname" || l === "last") auto[h] = "last_name";
          else if (l.includes("company") || l.includes("org")) auto[h] = "company";
          else if (l.includes("title") || l.includes("role")) auto[h] = "title";
          else if (l.includes("phone") || l.includes("mobile")) auto[h] = "phone";
        }
        setMapping(auto);
      },
      error: (err) => {
        alert("CSV parse error: " + err.message);
      },
    });
  }, []);

  const mappedRows: MappedRow[] = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => {
      const m: MappedRow = { email: "" };
      for (const [src, dest] of Object.entries(mapping)) {
        const v = (r[src] ?? "").toString().trim();
        if (!dest) continue;
        if (dest === "email") m.email = v.toLowerCase();
        if (dest === "first_name") m.first_name = v || null;
        if (dest === "last_name") m.last_name = v || null;
        if (dest === "company") m.company = v || null;
        if (dest === "title") m.title = v || null;
        if (dest === "phone") m.phone = v || null;
      }
      return m;
    });
  }, [rows, mapping]);

  async function runPreview() {
    if (!mappedRows.length) return;
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/contacts/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const json = (await res.json()) as PreviewResult;
      setPreview(json);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    setCommitOk(null);
    setCommitErr(null);
    try {
      const res = await fetch("/api/contacts/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalized: preview.normalized, classified: preview.classified }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Commit failed");
      setCommitOk(`Imported ${json.inserted} new, updated ${json.updated}. Skipped ${json.skipped}.`);
    } catch (e: any) {
      setCommitErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const readyToSend = preview?.stats?.to_insert ?? 0;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Contacts (CSV)</h1>
          <p className="text-sm text-gray-500">Drag in a CSV, map columns, review de-dupe + suppression, then import.</p>
        </div>
      </header>

      {/* Drop area */}
      <div
        className="rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center hover:bg-gray-50 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onDrop(f);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv,text/csv";
          input.onchange = (ev: any) => {
            const f = ev.target.files?.[0];
            if (f) onDrop(f);
          };
          input.click();
        }}
      >
        <div className="text-sm text-gray-600">
          {csvName ? (
            <>Selected: <span className="font-medium">{csvName}</span></>
          ) : (
            <>Drag & drop your CSV here, or click to choose a file</>
          )}
        </div>
      </div>

      {/* Mapping */}
      {headers.length > 0 && (
        <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="text-sm font-medium">Map Columns</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-2">
                <label className="w-1/2 text-sm text-gray-600 truncate">{h}</label>
                <select
                  value={mapping[h] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                  className="w-1/2 px-2 py-2 border border-gray-300 rounded-xl bg-white text-sm"
                >
                  <option value="">(ignore)</option>
                  {CANONICAL_FIELDS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runPreview}
              disabled={busy || !mapping || mappedRows.length === 0}
              className="px-4 py-2 rounded-xl bg-black text-white text-sm"
            >
              {busy ? "Processing…" : "Preview De-dupe"}
            </button>
            {preview && (
              <button
                onClick={commitImport}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm"
              >
                Commit Import
              </button>
            )}
            {preview && (
              <span className="text-sm text-gray-600">
                Ready to Send: <span className="font-semibold">{readyToSend}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Preview summary */}
      {preview && (
        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Stat label="Total Rows" value={preview.stats.total_rows} />
            <Stat label="Invalid Email" value={preview.stats.invalid_email} />
            <Stat label="Dupes in File" value={preview.stats.duplicates_in_file} />
            <Stat label="Suppressed" value={preview.stats.suppressed} />
            <Stat label="Existing Contacts" value={preview.stats.existing_contacts} />
            <Stat label="To Insert" value={preview.stats.to_insert} />
            <Stat label="To Update" value={preview.stats.to_update} />
            <Stat label="Ready to Send" value={readyToSend} />
          </div>

          {commitOk && <div className="mt-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded-xl p-3">{commitOk}</div>}
          {commitErr && <div className="mt-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl p-3">{commitErr}</div>}
        </div>
      )}

      {/* Sample preview table */}
      {mappedRows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {CANONICAL_FIELDS.map((f) => (
                  <th key={f} className="px-3 py-2 text-left">{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappedRows.slice(0, 15).map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {CANONICAL_FIELDS.map((f) => (
                    <td key={f} className="px-3 py-2">{(r as any)[f] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 text-xs text-gray-500">Showing first 15 mapped rows.</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}