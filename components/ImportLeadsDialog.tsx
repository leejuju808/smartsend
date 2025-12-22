"use client";

import { useRef, useState, useMemo } from "react";
import Papa from "papaparse";

type RawRow = Record<string, string>;
type MappedRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  [k: string]: string | undefined;
};

const REQUIRED = ["email"];
const SUGGESTED = ["first_name", "last_name", "company"];

const DEFAULT_MAPPING = {
  email: "email",
  first_name: "first",
  last_name: "last",
  company: "company",
};

export default function ImportLeadsDialog({
  campaignId,
  onImported,
}: {
  campaignId: string;
  onImported?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<"idle" | "mapping" | "importing" | "done">("idle");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    email: "",
    first_name: "",
    last_name: "",
    company: "",
  });
  const [errorCsvUrl, setErrorCsvUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  function onPickFile() {
    fileRef.current?.click();
  }

  function handleFile(f: File) {
    Papa.parse<RawRow>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const data = res.data || [];
        if (data.length === 0) {
          alert("CSV appears empty.");
          return;
        }
        const hdrs = Object.keys(data[0] || {});
        setHeaders(hdrs);
        const auto: Record<string, string> = { email: "", first_name: "", last_name: "", company: "" };
        hdrs.forEach((h) => {
          const key = h.toLowerCase();
          if (!auto.email && key.includes("mail")) auto.email = h;
          if (!auto.first_name && (key === "first" || key.includes("first"))) auto.first_name = h;
          if (!auto.last_name && (key === "last" || key.includes("last"))) auto.last_name = h;
          if (!auto.company && (key === "company" || key.includes("org") || key.includes("comp"))) auto.company = h;
        });
        setMapping((m) => ({ ...m, ...auto }));
        setRows(data);
        setStep("mapping");
      },
      error: (err) => {
        console.error(err);
        alert("Failed to parse CSV. Check the file and try again.");
      },
    });
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function onImport() {
    for (const r of REQUIRED) {
      if (!mapping[r]) {
        alert(`Map the required field: ${r}`);
        return;
      }
    }
    setStep("importing");
    setProgress({ done: 0, total: rows.length });

    const mapped: MappedRow[] = rows.map((r) => {
      const out: MappedRow = {
        email: (r[mapping.email] || "").trim(),
      };
      if (mapping.first_name) out.first_name = r[mapping.first_name];
      if (mapping.last_name) out.last_name = r[mapping.last_name];
      if (mapping.company) out.company = r[mapping.company];
      return out;
    });

    const chunkSize = 1000;
    let failed: Array<Record<string, string>> = [];
    for (let i = 0; i < mapped.length; i += chunkSize) {
      const chunk = mapped.slice(i, i + chunkSize);
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, rows: chunk }),
      });
      if (!res.ok) {
        alert("Import failed for a chunk. See console for details.");
        try {
          const payload = await res.json();
          console.error(payload);
          if (payload?.failed?.length) {
            failed = failed.concat(payload.failed);
          }
        } catch {}
      } else {
        const payload = await res.json();
        if (payload?.failed?.length) {
          failed = failed.concat(payload.failed);
        }
      }
      setProgress({ done: Math.min(i + chunk.length, mapped.length), total: mapped.length });
    }

    if (failed.length > 0) {
      const csv = Papa.unparse(failed);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      setErrorCsvUrl(url);
      alert(`Import done with ${failed.length} error(s). Download error.csv to fix & retry.`);
    } else {
      alert("Import complete ✅");
    }

    setStep("done");
    onImported?.();
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {step === "idle" && (
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">Import Leads (CSV)</h3>
          <button className="rounded-2xl px-4 py-2 border shadow-sm" onClick={onPickFile}>
            Choose CSV
          </button>
          <p className="text-sm opacity-70">Required: <b>email</b>. Suggested: first_name, last_name, company.</p>
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Map Columns</h3>
          {[...REQUIRED, ...SUGGESTED].map((field) => (
            <div key={field} className="flex items-center gap-2">
              <label className="w-36 text-sm">{field}{REQUIRED.includes(field) ? " *" : ""}</label>
              <select
                className="border rounded-lg px-2 py-1"
                value={mapping[field] || ""}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
              >
                <option value="">— Not Mapped —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="mt-3">
            <h4 className="text-sm font-semibold">Preview (first 5 rows)</h4>
            <pre className="text-xs max-h-40 overflow-auto border rounded-lg p-2">
{JSON.stringify(preview.slice(0, 5), null, 2)}
            </pre>
          </div>
          <div className="flex gap-2">
            <button className="rounded-2xl px-4 py-2 border" onClick={() => setStep("idle")}>Back</button>
            <button className="rounded-2xl px-4 py-2 border shadow-sm" onClick={onImport}>Import</button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Importing…</h3>
          <p className="text-sm">{progress.done} / {progress.total}</p>
          <div className="w-full h-2 bg-gray-200 rounded">
            <div
              className="h-2 bg-black rounded"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Finished</h3>
          {errorCsvUrl ? (
            <a className="underline" href={errorCsvUrl} download="error.csv">Download error.csv</a>
          ) : (
            <p className="text-sm">All rows imported.</p>
          )}
        </div>
      )}
    </div>
  );
}


