"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { insertLeads } from "./actions";

type Row = Record<string, string>;
const REQUIRED = ["email"] as const;
const OPTIONAL = ["first_name", "company", "title"] as const;
const ALL_FIELDS = [...REQUIRED, ...OPTIONAL] as const;
type Field = typeof ALL_FIELDS[number];

export default function LeadsUploadPage() {
  const router = useRouter();
  const params = useParams(); // { id: campaignId }
  const campaignId = String(params?.id);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string | null>>({
    email: null,
    first_name: null,
    company: null,
    title: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "saving">("idle");

  // simple CSV parse (no external deps). expects first row as headers, comma-separated.
  function parseCSV(text: string): { headers: string[]; rows: Row[] } {
    const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    // naive split respecting quotes
    const split = (line: string) => {
      const out: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { out.push(cur); cur = ""; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const hdr = split(lines[0]);
    const data = lines.slice(1).map(l => split(l)).map(vals => {
      const r: Row = {};
      hdr.forEach((h, i) => r[h] = vals[i] ?? "");
      return r;
    });
    return { headers: hdr, rows: data };
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setStatus("parsing");
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (!headers.length || !rows.length) {
      setErr("Could not parse CSV. Ensure the first row has headers and there is data.");
      setStatus("idle");
      return;
    }
    setHeaders(headers);
    setRows(rows);
    // naive auto-map by name
    const lower = headers.map(h => h.toLowerCase());
    const initialMap: Record<Field, string | null> = {
      email: headers[lower.indexOf("email")] ?? null,
      first_name: headers[lower.indexOf("first_name")] ?? headers[lower.indexOf("firstname")] ?? headers[lower.indexOf("first name")] ?? null,
      company: headers[lower.indexOf("company")] ?? null,
      title: headers[lower.indexOf("title")] ?? headers[lower.indexOf("job_title")] ?? null,
    };
    setMapping(initialMap);
    setStatus("ready");
  }

  function buildPayload() {
    // validate required fields mapped
    for (const f of REQUIRED as Field[]) {
      if (!mapping[f]) throw new Error(`Map the required field: ${f}`);
    }
    const leads = rows.map(r => {
      const email = r[mapping.email as string]?.trim();
      if (!email) return null;
      return {
        email,
        first_name: mapping.first_name ? r[mapping.first_name] || null : null,
        company: mapping.company ? r[mapping.company] || null : null,
        title: mapping.title ? r[mapping.title] || null : null,
      };
    }).filter(Boolean);
    return { campaignId, leads };
  }

  async function handleSave() {
    try {
      setErr(null); setStatus("saving");
      const payload = buildPayload();
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      const res = await insertLeads(fd); // server action
      alert(`Inserted: ${res.inserted}, Skipped (dupes): ${res.skipped}`);
      router.push(`/campaigns/${campaignId}/review`); // next: review + launch
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save leads");
      setStatus("ready");
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-8">
      <h1 className="text-2xl font-semibold">Upload Leads (CSV)</h1>

      <section className="rounded-2xl border p-4 space-y-4">
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        <p className="text-sm opacity-70">
          Required column: <b>email</b>. Optional: first_name, company, title.
        </p>
      </section>

      {status !== "idle" && (
        <section className="rounded-2xl border p-4 space-y-4">
          <h2 className="font-semibold">Map Fields</h2>
          {[...ALL_FIELDS].map((field) => (
            <div key={field} className="grid grid-cols-2 gap-4 items-center">
              <div className="text-sm">
                {field} {REQUIRED.includes(field) && <span className="text-red-500">*</span>}
              </div>
              <select
                className="rounded-xl border p-2"
                value={mapping[field] ?? ""}
                onChange={(e) => setMapping(s => ({ ...s, [field]: e.target.value || null }))}
              >
                <option value="">— not mapped —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}

      {preview.length > 0 && (
        <section className="rounded-2xl border p-4">
          <h2 className="font-semibold mb-2">Preview (first 5 rows)</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>{headers.map(h => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    {headers.map(h => <td key={h} className="border px-2 py-1">{r[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={status !== "ready"}
          onClick={handleSave}
          className="rounded-xl border px-5 py-2 text-sm"
        >
          {status === "saving" ? "Saving…" : "Save leads"}
        </button>
        {err && <span className="text-red-600 text-sm">{err}</span>}
      </div>
    </main>
  );
}

