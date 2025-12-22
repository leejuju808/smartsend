"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supa = createClientComponentClient();

type AppColumn = {
  key: string;
  label: string;
  required: boolean;
};

const AppColumns: AppColumn[] = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "company", label: "Company", required: false },
  { key: "title", label: "Title", required: false },
  { key: "website", label: "Website", required: false },
  { key: "notes", label: "Notes", required: false },
];

type AnyRow = Record<string, any>;

interface CsvImportWizardProps {
  campaignId: string;
  userId: string;
  onClose: () => void;
  onImportComplete: (result: { imported: number; skipped: number; invalid: number; total: number }) => void;
}

const EmailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function validateRow(row: AnyRow): string[] {
  const issues: string[] = [];
  if (!row.email || !EmailRe.test(String(row.email))) {
    issues.push("invalid email");
  }
  return issues;
}

export function CsvImportWizard({ campaignId, userId, onClose, onImportComplete }: CsvImportWizardProps) {
  const [step, setStep] = useState<"upload" | "map" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Deduplication state
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [skipExisting, setSkipExisting] = useState(true);

  // Fetch existing campaign emails on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supa
        .from("leads")
        .select("email")
        .eq("campaign_id", campaignId)
        .limit(100000);
      if (!error && data) {
        setExistingEmails(new Set(data.map(d => String(d.email || "").toLowerCase())));
      }
    })();
  }, [campaignId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFile(file);
    setError(null);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
          return;
        }

        const data = results.data as any[];
        if (data.length === 0) {
          setError('No data found in CSV file');
          return;
        }

        setRows(data);
        setHeaders(Object.keys(data[0]));
        
        // Auto-map common fields
        const autoMapping: Record<string, string> = {};
        Object.keys(data[0]).forEach(header => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('email')) autoMapping.email = header;
          else if (lowerHeader.includes('first') || lowerHeader.includes('name')) autoMapping.first_name = header;
          else if (lowerHeader.includes('last')) autoMapping.last_name = header;
          else if (lowerHeader.includes('company')) autoMapping.company = header;
          else if (lowerHeader.includes('title') || lowerHeader.includes('job')) autoMapping.title = header;
          else if (lowerHeader.includes('website')) autoMapping.website = header;
          else if (lowerHeader.includes('notes')) autoMapping.notes = header;
        });

        setMapping(autoMapping);
        setStep("map");
      },
      error: (error) => {
        setError(`Failed to parse CSV: ${error.message}`);
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    multiple: false
  });

  // Compute stats for deduplication
  const stats = useMemo(() => {
    let invalid = 0, dupEmails = 0, existingMatches = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const mapped: AnyRow = {};
      for (const c of AppColumns) {
        const src = mapping[c.key];
        mapped[c.key] = src ? r[src] : "";
      }
      const issues = validateRow(mapped);
      if (issues.length) invalid++;
      const email = String(mapped.email || "").toLowerCase();
      if (email) {
        if (seen.has(email)) dupEmails++;
        else seen.add(email);
        if (existingEmails.has(email)) existingMatches++;
      }
    }
    return { total: rows.length, invalid, dupEmails, existingMatches };
  }, [rows, mapping, existingEmails]);

  const buildPayload = () => {
    const payload = rows.map((r) => {
      const out: AnyRow = { user_id: userId, campaign_id: campaignId };
      for (const c of AppColumns) {
        const src = mapping[c.key];
        let val = src ? (r[src] ?? "") : "";
        if (typeof val === "string") val = val.trim();
        out[c.key] = val || null;
      }
      return out;
    })
    .filter((x) => x.email && EmailRe.test(String(x.email)));

    return payload.filter((x) =>
      skipExisting ? !existingEmails.has(String(x.email).toLowerCase()) : true
    );
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      const response = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, rows: payload })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Import failed');
      }

      const result = await response.json();
      setResult(result);
      onImportComplete(result);
      
      // Update existing emails with newly imported ones
      const newEmails = payload.map(p => String(p.email).toLowerCase());
      setExistingEmails(prev => new Set([...prev, ...newEmails]));
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Import Leads</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {/* Upload Step */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <div className="space-y-2">
                <div className="text-lg">📁</div>
                <div>
                  {isDragActive ? (
                    <p>Drop the CSV file here...</p>
                  ) : (
                    <p>Drag & drop a CSV file here, or click to select</p>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  Supports CSV files with headers
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <a
                href="/api/leads/template"
                className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700"
              >
                Download CSV Template
              </a>
              <a
                href="data:text/csv;charset=utf-8,email,first_name,last_name,company,title,website,notes%0A"
                download="smartsend_blank_template.csv"
                className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700"
              >
                Blank Template
              </a>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Mapping Step */}
        {step === "map" && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Map CSV Columns</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">CSV Column</th>
                    {AppColumns.map(col => (
                      <th key={col.key} className="text-left p-2 font-medium">
                        {col.label} {col.required && <span className="text-red-500">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2 font-medium">{header}</td>
                      {AppColumns.map(col => (
                        <td key={col.key} className="p-2">
                          <select
                            value={mapping[col.key] === header ? header : ''}
                            onChange={(e) => {
                              const newMapping = { ...mapping };
                              if (e.target.value) {
                                newMapping[col.key] = e.target.value;
                              } else {
                                delete newMapping[col.key];
                              }
                              setMapping(newMapping);
                            }}
                            className="w-full border rounded px-2 py-1"
                          >
                            <option value="">Skip</option>
                            <option value={header}>{header}</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep("upload")}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep("review")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Review Import
              </button>
            </div>
          </div>
        )}

        {/* Review Step */}
        {step === "review" && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Review Import</h3>
            
            <div className="text-xs text-neutral-400">
              {stats.total} rows • {stats.invalid} invalid • {stats.dupEmails} file dupes • {stats.existingMatches} already in campaign
            </div>

            <div className="flex items-center gap-2 mt-2">
              <input
                id="skip-existing"
                type="checkbox"
                checked={skipExisting}
                onChange={(e) => setSkipExisting(e.target.checked)}
                className="accent-yellow-400"
              />
              <label htmlFor="skip-existing" className="text-sm text-neutral-300">
                Skip leads that already exist in this campaign
              </label>
            </div>

            <div className="overflow-x-auto max-h-64 border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {AppColumns.map(col => (
                      <th key={col.key} className="p-2 text-left font-medium">
                        {col.label}
                      </th>
                    ))}
                    <th className="p-2 text-left font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, idx) => {
                    const mapped: AnyRow = {};
                    for (const c of AppColumns) {
                      const src = mapping[c.key];
                      mapped[c.key] = src ? row[src] : "";
                    }
                    const issues = validateRow(mapped);
                    const emailLower = String(mapped.email || "").toLowerCase();
                    if (existingEmails.has(emailLower)) issues.push("already in campaign");
                    
                    return (
                      <tr key={idx} className="border-b">
                        {AppColumns.map(col => (
                          <td key={col.key} className="p-2">
                            {String(mapped[col.key] || "")}
                          </td>
                        ))}
                        <td className="p-2 text-red-600">
                          {issues.length > 0 ? issues.join(", ") : "✓"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > 10 && (
              <p className="text-sm text-gray-500">
                Showing first 10 rows of {rows.length} total
              </p>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep("map")}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Importing..." : "Import Leads"}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {result && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800">
                  Imported <b>{result.imported}</b> • Skipped <b>{result.skipped}</b> • Invalid <b>{result.invalid}</b> (Total {result.total})
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}