// Block 14600 — Contact Import Wizard
// Route: /contacts/import
// Upload → Map → Review → Done

"use client";

import { useState } from "react";
import Papa from "papaparse";

type Mapping = Record<string, string>; // csvHeader -> field

const FIELDS = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "notes", label: "Notes" },
];

export default function ContactImportPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [listName, setListName] = useState("");
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/contacts/import/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Upload failed");
        return;
      }

      setImportId(data.import_id);
      setHeaders(data.headers);
      setPreviewRows(data.preview_rows);

      // Parse full CSV client-side for commit
      const text = await file.text();
      const parsePromise = new Promise<any[]>((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            resolve(results.data as any[]);
          },
          error: (err) => {
            reject(err);
          },
        });
      });
      const allRows = await parsePromise;
      setParsedRows(allRows);

      setStep(2);
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!importId) return;
    if (!listName) {
      alert("Enter a list name");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/contacts/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_id: importId,
          list_name: listName,
          rows: parsedRows.length ? parsedRows : previewRows,
          column_mapping: mapping,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Import failed");
        return;
      }

      setImportSummary(data);
      setStep(3);
    } catch (err: any) {
      alert(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function autoGuessField(header: string): string {
    const h = header.toLowerCase();
    if (h.includes("email")) return "email";
    if (h.includes("first")) return "first_name";
    if (h.includes("last")) return "last_name";
    if (h.includes("phone")) return "phone";
    if (h.includes("city")) return "city";
    if (h.includes("state")) return "state";
    if (h.includes("zip") || h.includes("postal")) return "zip";
    if (h.includes("note")) return "notes";
    return "";
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import Contacts</h1>
        <p className="text-xs text-gray-600 mt-1">
          Upload your homeowner list as a CSV, map the columns, and we&apos;ll create a list you can target in campaigns.
        </p>
      </div>

      <div className="border rounded-2xl p-4 bg-white space-y-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Step {step} of 3
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold">1. Upload CSV file</div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
                className="text-xs"
              />
              <div className="text-[10px] text-gray-500">
                Required: at least an Email column. Optional: name, phone, city, etc.
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="px-4 py-1.5 rounded-xl bg-black text-white text-xs font-semibold disabled:opacity-40"
            >
              {loading ? "Uploading…" : "Upload & Preview"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-xs font-semibold">
              2. Map your columns to contact fields
            </div>
            <div className="text-[11px] text-gray-600">
              We guessed some fields based on the column names. Adjust as needed.
            </div>
            <div className="space-y-2">
              {headers.map((header) => (
                <div
                  key={header}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="text-xs font-medium">{header}</div>
                  <select
                    value={mapping[header] ?? autoGuessField(header)}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [header]: e.target.value,
                      }))
                    }
                    className="border rounded-xl px-2 py-1 text-[11px]"
                  >
                    <option value="">Ignore</option>
                    {FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-2">
              <div className="text-xs font-semibold">List name</div>
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Ex: Tacoma Storm Leads"
                className="w-full border rounded-xl px-3 py-1.5 text-sm"
              />
            </div>

            <button
              onClick={handleCommit}
              disabled={loading}
              className="px-4 py-1.5 rounded-xl bg-black text-white text-xs font-semibold disabled:opacity-40"
            >
              {loading ? "Importing…" : "Import Contacts"}
            </button>
          </div>
        )}

        {step === 3 && importSummary && (
          <div className="space-y-3">
            <div className="text-xs font-semibold">3. Import complete</div>
            <div className="text-sm">
              Imported{" "}
              <span className="font-semibold">
                {importSummary.imported}
              </span>{" "}
              contacts. Skipped{" "}
              <span className="font-semibold">
                {importSummary.skipped}
              </span>{" "}
              rows (missing email or suppressed).
            </div>
            <a
              href="/contacts"
              className="inline-flex px-4 py-1.5 rounded-xl bg-black text-white text-xs font-semibold"
            >
              View contacts
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

