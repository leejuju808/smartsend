"use client";

import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";

const CORE_FIELDS = ["email","first_name","last_name","company","phone","custom1","custom2","custom3"] as const;
type CoreField = typeof CORE_FIELDS[number];

type ParsedRow = Record<string, string | undefined>;

function isEmail(s?: string) {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function CsvImport({ campaignId }: { campaignId: string }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [map, setMap] = useState<Record<CoreField, string | "">>({
    email: "", first_name: "", last_name: "", company: "", phone: "", custom1: "", custom2: "", custom3: ""
  });
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => rows.slice(0, 20), [rows]);

  function onFile(file: File) {
    setLoading(true);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (res) => {
        const data = (res.data || []).map(r => {
          const out: Record<string,string> = {};
          Object.keys(r).forEach(k => { out[k.trim()] = (r as any)[k]; });
          return out;
        });
        setRows(data);
        setHeaders(Object.keys(data[0] || {}));
        // auto map obvious columns
        const lower = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
        const m: any = { email:"", first_name:"", last_name:"", company:"", phone:"", custom1:"", custom2:"", custom3:"" };
        for (const h of Object.keys(data[0] || {})) {
          const l = lower(h);
          if (l.includes("email")) m.email = h;
          else if (l === "first_name" || l === "firstname" || l === "first") m.first_name = h;
          else if (l === "last_name" || l === "lastname" || l === "last") m.last_name = h;
          else if (l.includes("company") || l.includes("org")) m.company = h;
          else if (l.includes("phone") || l.includes("mobile")) m.phone = h;
        }
        setMap((prev) => ({ ...prev, ...m }));
        setLoading(false);
      },
      error: () => setLoading(false),
    });
  }

  const stats = useMemo(() => {
    if (!preview.length) return { valid: 0, invalid: 0 };
    let valid = 0, invalid = 0;
    for (const r of preview) {
      const emailCol = map.email;
      const email = emailCol ? r[emailCol] : undefined;
      if (isEmail(email)) valid++; else invalid++;
    }
    return { valid, invalid };
  }, [preview, map]);

  async function importNow() {
    if (!rows.length) return;
    const emailCol = map.email;
    if (!emailCol) { alert("Map the Email column before importing."); return; }

    // Build clean payload
    const payload = rows.map(r => ({
      email: r[emailCol] || "",
      first_name: map.first_name ? r[map.first_name] : "",
      last_name: map.last_name ? r[map.last_name] : "",
      company: map.company ? r[map.company] : "",
      phone: map.phone ? r[map.phone] : "",
      custom1: map.custom1 ? r[map.custom1] : "",
      custom2: map.custom2 ? r[map.custom2] : "",
      custom3: map.custom3 ? r[map.custom3] : "",
    }));

    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Import failed");
      alert(`Imported\nInserted: ${j.summary.inserted}\nUpdated: ${j.summary.updated}\nSkipped: ${j.summary.skipped}`);
      // Optionally redirect to Leads list
      // location.href = `/campaigns/${campaignId}/leads`;
    } catch (e: any) {
      alert(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Import Leads (CSV)</h3>
        <button
          className="text-sm border rounded px-2 py-1 hover:bg-muted"
          onClick={() => fileRef.current?.click()}
        >
          Choose CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>

      {/* Mapping */}
      {!!headers.length && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["email","first_name","last_name","company","phone","custom1","custom2","custom3"] as CoreField[]).map((f) => (
            <label key={f} className="text-xs flex flex-col gap-1">
              Map: {f}
              <select
                className="border rounded px-2 py-1 text-sm"
                value={map[f]}
                onChange={(e) => setMap((m) => ({ ...m, [f]: e.target.value }))}
              >
                <option value="">(not mapped)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* Preview */}
      {!!preview.length && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Previewing {preview.length} rows. Valid emails: {stats.valid} • Invalid: {stats.invalid}
          </div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-2 py-1">email</th>
                  <th className="text-left px-2 py-1">first</th>
                  <th className="text-left px-2 py-1">last</th>
                  <th className="text-left px-2 py-1">company</th>
                  <th className="text-left px-2 py-1">phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const e = map.email ? r[map.email] : "";
                  const valid = isEmail(e);
                  return (
                    <tr key={i} className={valid ? "" : "bg-rose-50"}>
                      <td className="px-2 py-1">{e}</td>
                      <td className="px-2 py-1">{map.first_name ? r[map.first_name] : ""}</td>
                      <td className="px-2 py-1">{map.last_name ? r[map.last_name] : ""}</td>
                      <td className="px-2 py-1">{map.company ? r[map.company] : ""}</td>
                      <td className="px-2 py-1">{map.phone ? r[map.phone] : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          className="text-sm border rounded px-3 py-1 hover:bg-muted disabled:opacity-50"
          disabled={!rows.length || !map.email || loading}
          onClick={importNow}
        >
          {loading ? "Importing..." : "Import Leads"}
        </button>
      </div>
    </div>
  );
}

