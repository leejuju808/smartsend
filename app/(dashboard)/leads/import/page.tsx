"use client";

import { useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

const SYSTEM_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "name",
  "address",
  "city",
  "state",
  "zip",
];

export default function ImportLeadsPage() {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        const cols = results.meta.fields ?? [];

        setCsvData(rows);
        setColumns(cols);

        // Auto map common names
        const autoMap: Record<string, string> = {};
        cols.forEach((col) => {
          const lower = col.toLowerCase();
          if (lower.includes("email")) autoMap[col] = "email";
          else if (lower.includes("first")) autoMap[col] = "first_name";
          else if (lower.includes("last")) autoMap[col] = "last_name";
          else if (lower.includes("name")) autoMap[col] = "name";
          else if (lower.includes("address")) autoMap[col] = "address";
          else if (lower.includes("city")) autoMap[col] = "city";
          else if (lower.includes("state")) autoMap[col] = "state";
          else if (lower.includes("zip")) autoMap[col] = "zip";
        });

        setMapping(autoMap);
        setStep("map");
      },
    });
  }

  async function importLeads() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping, rows: csvData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      setStatus(`Imported ${data.inserted} leads successfully.`);
      setStep("upload");
      
      // Redirect to leads page after a short delay
      setTimeout(() => {
        router.push("/leads");
      }, 2000);

    } catch (e: any) {
      setStatus(e.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">Import Leads</h1>
        <p className="text-sm text-neutral-400">
          Upload a CSV of homeowner leads for SmartSend to begin outreach.
        </p>
      </header>

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-xs">
          <label className="block rounded-xl border border-neutral-700 p-6 text-center cursor-pointer hover:border-neutral-600 transition-colors">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
            <div className="text-neutral-300">
              Click to upload CSV or drag & drop
            </div>
            <div className="mt-1 text-[0.65rem] text-neutral-500">
              Must include at least an email column.
            </div>
          </label>

          {status && (
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {status}
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Column Mapping */}
      {step === "map" && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-xs space-y-4">
          <h2 className="text-sm text-neutral-200 mb-2">Map your columns</h2>

          {columns.map((col) => (
            <div key={col} className="flex items-center gap-3">
              <div className="w-40 text-neutral-400">{col}</div>
              <select
                value={mapping[col] || ""}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [col]: e.target.value,
                  }))
                }
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
              >
                <option value="">Ignore</option>
                {SYSTEM_COLUMNS.map((sys) => (
                  <option key={sys} value={sys}>
                    {sys}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button
            onClick={() => setStep("preview")}
            className="mt-4 rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 transition-colors"
          >
            Preview Import
          </button>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === "preview" && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-xs space-y-4">
          <h2 className="text-sm text-neutral-200">Preview (first 50 rows)</h2>

          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-max text-[0.7rem]">
              <thead className="bg-neutral-900">
                <tr>
                  {Object.keys(mapping)
                    .filter((k) => mapping[k])
                    .map((col) => (
                      <th
                        key={col}
                        className="px-2 py-1 text-neutral-300 border-b border-neutral-800"
                      >
                        {mapping[col]}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {Object.keys(mapping)
                      .filter((k) => mapping[k])
                      .map((col) => (
                        <td
                          key={col}
                          className="px-2 py-1 border-b border-neutral-800 text-neutral-200"
                        >
                          {row[col]}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {status && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2 text-neutral-300">
              {status}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("map")}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-colors"
            >
              Back
            </button>
            <button
              disabled={loading}
              onClick={importLeads}
              className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50 hover:bg-neutral-200 transition-colors"
            >
              {loading ? "Importing…" : "Import Leads"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

























































