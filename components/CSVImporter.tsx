"use client";

import { useState, useMemo } from "react";
import type Papa from "papaparse";
import LoadingButton from "@/components/ui/LoadingButton";

export type LeadRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
};

type CsvRow = Record<string, string>;

const REQUIRED_FIELDS = ["email"];
const OPTIONAL_FIELDS = ["first_name", "last_name", "company"];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

export default function CSVImporter() {
  const [rawRows, setRawRows] = useState<CsvRow[]>([]);
  const [mapped, setMapped] = useState<Record<string, string>>({});
  const [previewCount, setPreviewCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const headers = useMemo(() => {
    if (!rawRows.length) return [];
    const keys = new Set<string>();
    rawRows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [rawRows]);

  const mappedOkay = useMemo(() => {
    // email must be mapped
    return REQUIRED_FIELDS.every((f) => mapped[f]);
  }, [mapped]);

  const handleFile = async (file: File) => {
    setMsg(null);
    setRawRows([]);
    setMapped({});

    // Parse CSV with Papa (dynamic import keeps SSR happy). If missing, run: npm i papaparse
    const Papa = (await import("papaparse")).default;
    
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          setMsg(`CSV parse error: ${results.errors[0].message}`);
          return;
        }

        // Lowercase headers for consistent mapping
        const rows = (results.data || []).map((r: any) => {
          const normalized: CsvRow = {};
          Object.keys(r).forEach((k) => {
            normalized[k.trim().toLowerCase()] = typeof r[k] === "string" ? r[k].trim() : r[k];
          });
          return normalized;
        }).filter((r: CsvRow) => Object.values(r).some(Boolean));

        if (!rows.length) {
          setMsg("No data rows found in CSV.");
          return;
        }

        // Extract headers from first row
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

        // Auto-map common header names -> our field names
        const guess: Record<string, string> = {};
        const commonMap: Record<string, string[]> = {
          email: ["email", "e-mail", "work_email"],
          first_name: ["first", "first_name", "firstname", "givenname"],
          last_name: ["last", "last_name", "lastname", "surname", "familyname"],
          company: ["company", "org", "organization", "employer", "business"],
        };
        for (const field of ALL_FIELDS) {
          const candidates = commonMap[field] || [field];
          const hit = headers.find((h: string) => candidates.includes(h.toLowerCase()));
          if (hit) guess[field] = hit;
        }

        setMapped(guess);
        setRawRows(rows);
      },
      error: (error: Error) => {
        setMsg(`CSV parse error: ${error.message}`);
      },
    });
  };



  const handleImport = async () => {
    if (!selectedFile) return setMsg("Please select a CSV file.");
    if (!mappedOkay) return setMsg("Please map the required fields (email).");
    setBusy(true);
    setMsg(null);
    try {
      // Build CSV content with mapped headers
      const headers = Object.keys(mapped).filter(k => mapped[k]);
      const rows = rawRows.map((r) => {
        const row: Record<string, string> = {};
        for (const [field, csvHeader] of Object.entries(mapped)) {
          if (csvHeader && r[csvHeader]) {
            row[field] = r[csvHeader];
          }
        }
        return row;
      }).filter((r) => r.email);

      // Create new CSV file with mapped data
      const newCsvContent = [
        headers.join(","),
        ...rows.map(r => headers.map(h => `"${r[h] || ""}"`).join(","))
      ].join("\n");

      const formData = new FormData();
      const blob = new Blob([newCsvContent], { type: "text/csv" });
      const csvFile = new File([blob], selectedFile.name, { type: "text/csv" });
      formData.append("file", csvFile);
      formData.append("sequence_id", prompt("Enter Sequence ID:") || "");

      const res = await fetch("/api/import-leads", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setMsg(`Import failed: ${data.error || "Unknown error"}`);
      } else {
        setMsg(`Imported ${rows.length} lead(s). Upserted: ${data.upserted}, Enrolled: ${data.enrolled}`);
        setRawRows([]);
        setSelectedFile(null);
      }
    } catch (e: any) {
      setMsg(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-black text-white rounded-2xl shadow">
      <h2 className="text-xl font-semibold mb-4">CSV Lead Importer</h2>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <label className="block">
          <span className="text-sm text-gray-300">Upload CSV</span>
          <input
            className="mt-1 w-full rounded-xl bg-gray-900 border border-gray-700 p-2"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setSelectedFile(f);
                void handleFile(f);
              }
            }}
          />
        </label>
      </div>

      {headers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Map Columns</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ALL_FIELDS.map((field) => (
              <label key={field} className="flex items-center gap-3">
                <span className={`w-28 text-sm ${REQUIRED_FIELDS.includes(field) ? "text-yellow-300" : "text-gray-300"}`}>
                  {field}{REQUIRED_FIELDS.includes(field) ? " *" : ""}
                </span>
                <select
                  className="flex-1 rounded-xl bg-gray-900 border border-gray-700 p-2"
                  value={mapped[field] || ""}
                  onChange={(e) =>
                    setMapped((m) => ({ ...m, [field]: e.target.value || "" }))
                  }
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!mappedOkay && (
            <p className="mt-2 text-sm text-red-400">Email mapping is required.</p>
          )}
        </div>
      )}

      {rawRows.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium">Preview</h3>
            <input
              type="number"
              min={1}
              max={100}
              className="w-20 rounded-xl bg-gray-900 border border-gray-700 p-1 text-right"
              value={previewCount}
              onChange={(e) => setPreviewCount(parseInt(e.target.value || "10"))}
            />
          </div>
          <div className="overflow-auto border border-gray-800 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-300">
                <tr>
                  {ALL_FIELDS.map((f) => (
                    <th key={f} className="text-left p-2 capitalize">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, previewCount).map((r, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    {ALL_FIELDS.map((f) => (
                      <td key={f} className="p-2">
                        {mapped[f] ? r[mapped[f]] : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Showing first {Math.min(previewCount, rawRows.length)} of {rawRows.length} rows.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <LoadingButton
          loading={busy}
          disabled={!rawRows.length || !mappedOkay || !selectedFile}
          onClick={handleImport}
          className={
            busy || !rawRows.length || !mappedOkay || !selectedFile
              ? "bg-gray-700 text-gray-400"
              : "bg-yellow-400 text-black hover:bg-yellow-300"
          }
          spinnerClassName="text-black"
        >
          {busy ? "Importing…" : "Import Leads"}
        </LoadingButton>
        {msg && <span className="text-sm text-gray-200">{msg}</span>}
      </div>
    </div>
  );
}
