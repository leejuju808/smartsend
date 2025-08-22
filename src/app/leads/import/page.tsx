"use client";
import { useState } from "react";
import Papa from "papaparse";

type MapKey = "email"|"name"|"company"|"custom1"|"custom2"|"custom3"|"timezone";
const FIELDS: MapKey[] = ["email", "name", "company", "custom1", "custom2", "custom3", "timezone"];

export default function ImportLeadsPage() {
  const [raw, setRaw] = useState<any[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<number, MapKey | "skip">>({});
  const [preview, setPreview] = useState<any[][]>([]);
  const [result, setResult] = useState<{imported:number; skipped:number; invalid:number; total:number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function onFile(file: File) {
    setError(null); setResult(null);
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        let rows: any[][] = res.data as any[][];
        if (!rows.length) { setError("Empty CSV"); return; }

        // Detect header row by checking for an '@' in row 1 vs row 0
        const [first, second] = [rows[0], rows[1] || []];
        const isHeader = !(first || []).some((c: string) => String(c).includes("@")) && (second || []).some((c: string) => String(c).includes("@"));
        const hdrs = (isHeader ? first : first.map((_: any, i: number) => `Column ${i+1}`)) as string[];
        const body = isHeader ? rows.slice(1) : rows;

        setHeaders(hdrs);
        setRaw(body);
        setPreview(body.slice(0, 20));

        // Auto-map simple cases
        const m: Record<number, MapKey | "skip"> = {};
        hdrs.forEach((h, i) => {
          const hl = h.toLowerCase();
          if (/(^|\s)email(s)?(\s|$)/.test(hl)) m[i] = "email";
          else if (/name/.test(hl)) m[i] = "name";
          else if (/company|org|organization/.test(hl)) m[i] = "company";
          else m[i] = "skip";
        });
        setMapping(m);
      },
      error: (err) => setError(String(err))
    });
  }

  function buildRows() {
    const rows = raw.map(r => {
      const out: any = {};
      Object.entries(mapping).forEach(([colIdxStr, field]) => {
        const colIdx = Number(colIdxStr);
        if (field && field !== "skip") out[field] = r[colIdx] ?? "";
      });
      return out;
    });
    return rows;
  }

  async function submit() {
    setLoading(true); setError(null); setResult(null);
    try {
      // Fetch user id from server
      const who = await fetch("/api/auth/get-user").then(r=>r.json()).catch(()=>({ userId: null }));
      if (!who?.userId) throw new Error("Not signed in");
      const rows = buildRows();
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: who.userId, rows })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Import failed");
      setResult(j);
    } catch (e:any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 grid gap-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold">Import Leads</h1>

      <div className="rounded-2xl border p-4">
        <div className="text-sm text-gray-600 mb-2">Upload CSV</div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e)=> e.target.files?.[0] && onFile(e.target.files[0])}
          className="block"
        />
        <div className="text-xs text-gray-500 mt-2">
          Tip: Use the <a href="/leads_template.csv" className="underline">CSV template</a>. Max 5000 rows per import.
        </div>
      </div>

      {headers.length > 0 && (
        <div className="rounded-2xl border p-4">
          <div className="font-medium mb-2">Map columns</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="p-2 text-left">
                      <div className="mb-1 text-gray-600">{h}</div>
                      <select
                        className="border rounded px-2 py-1"
                        value={mapping[i] || "skip"}
                        onChange={(e)=> setMapping({ ...mapping, [i]: e.target.value as any })}
                      >
                        <option value="skip">Skip</option>
                        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {row.map((cell: any, ci: number) => (
                      <td key={ci} className="p-2 text-gray-700">{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={submit}
              disabled={loading}
              className="rounded-xl bg-black text-white px-4 py-2"
            >
              {loading ? "Importing…" : "Import"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
            {result && (
              <span className="text-sm text-gray-700">
                Imported <b>{result.imported}</b> • Skipped <b>{result.skipped}</b> • Invalid <b>{result.invalid}</b> (Total {result.total})
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Timezone mapping: Use IANA names like <code>Europe/London</code> or <code>America/New_York</code>. Leave blank to auto-guess from email TLD.
          </div>
        </div>
      )}
    </div>
  );
}

