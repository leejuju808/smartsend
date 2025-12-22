/**
 * Block 13600 — SmartSend Contact Import v2
 * 7-Step Import Flow: Upload → Mapping → Preview → Lists/Tags → Summary → Progress → Completion
 */

"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Mapping = Record<string, string>;

const SYSTEM_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "full_name", label: "Full Name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "phone", label: "Phone" },
  { key: "tags", label: "Tags" },
  { key: "notes", label: "Notes" },
  { key: "past_quote_amount", label: "Past Quote Amount" },
  { key: "appointment_date", label: "Appointment Date" },
];

interface PreviewRow {
  rowNumber: number;
  rawData: Record<string, any>;
  mappedData: Record<string, any>;
  validation: {
    isValid: boolean;
    isMissingEmail: boolean;
    isInvalidEmail: boolean;
    isDuplicate: boolean;
    isSuppressed: boolean;
    errors: string[];
  };
  enrichment: {
    willEnrichCity: boolean;
    willEnrichZip: boolean;
    willEnrichNeighborhood: boolean;
  };
  tags: {
    willApplyTags: string[];
    stormZoneMatch: boolean;
    neighborhoodMatch: boolean;
  };
  duplicateMatch?: {
    contactId: string;
    matchType: string;
    matchScore: number;
  };
}

export default function ContactImportV2Page() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<{
    preview: PreviewRow[];
    summary: any;
  } | null>(null);
  const [listId, setListId] = useState<string>("");
  const [listName, setListName] = useState<string>("");
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [importId, setImportId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<any>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-guess field mapping
  function autoGuessField(header: string): string {
    const h = header.toLowerCase();
    if (h.includes("email")) return "email";
    if (h.includes("first")) return "first_name";
    if (h.includes("last")) return "last_name";
    if (h.includes("full") && h.includes("name")) return "full_name";
    if (h.includes("phone")) return "phone";
    if (h.includes("address") && !h.includes("email")) return "address";
    if (h.includes("city")) return "city";
    if (h.includes("state")) return "state";
    if (h.includes("zip") || h.includes("postal")) return "zip";
    if (h.includes("tag")) return "tags";
    if (h.includes("note")) return "notes";
    if (h.includes("quote") || h.includes("estimate")) return "past_quote_amount";
    if (h.includes("appointment") || h.includes("date")) return "appointment_date";
    return "";
  }

  // Step 1: Upload File
  async function handleFileUpload() {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const parsePromise = new Promise<any[]>((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          trimHeaders: true,
          complete: (results) => {
            resolve(results.data as any[]);
          },
          error: (err) => {
            reject(err);
          },
        });
      });

      const parsedRows = await parsePromise;

      if (parsedRows.length === 0) {
        throw new Error("File has no rows");
      }

      const fileHeaders = Object.keys(parsedRows[0]);
      setHeaders(fileHeaders);
      setRows(parsedRows);

      // Auto-map fields
      const autoMapping: Mapping = {};
      fileHeaders.forEach((header) => {
        const guessed = autoGuessField(header);
        if (guessed) {
          autoMapping[header] = guessed;
        }
      });
      setMapping(autoMapping);

      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Field Mapping → Step 3: Preview
  async function handlePreview() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.slice(0, 25), // Preview first 25
          fieldMapping: mapping,
          defaultTags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Preview failed");
      }

      setPreview(data);
      setStep(4); // Go to Lists & Tags step
    } catch (err: any) {
      setError(err.message || "Failed to preview");
    } finally {
      setLoading(false);
    }
  }

  // Step 4: Choose Lists & Tags → Step 5: Summary
  function handleProceedToSummary() {
    if (step === 3) {
      setStep(4); // From preview, go to lists & tags
    } else if (step === 4) {
      setStep(5); // From lists & tags, go to summary
    }
  }

  // Step 5: Summary → Step 6: Start Import
  async function handleStartImport() {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.name.endsWith(".xlsx") ? "xlsx" : "csv",
          file_size: file.size,
          field_mapping: mapping,
          rows,
          list_id: listId || null,
          list_name: listName || null,
          default_tags: defaultTags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed to start");
      }

      setImportId(data.import_id);
      setStep(6);

      // Poll for status
      pollImportStatus(data.import_id);
    } catch (err: any) {
      setError(err.message || "Failed to start import");
    } finally {
      setLoading(false);
    }
  }

  // Poll import status
  async function pollImportStatus(id: string) {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/import/status/${id}`);
        const data = await response.json();

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          
          if (data.status === "completed") {
            // Get results
            const resultsResponse = await fetch(`/api/import/results/${id}`);
            const resultsData = await resultsResponse.json();
            setImportResults(resultsData);
            setStep(7);
          } else {
            setError(data.error_message || "Import failed");
          }
        } else {
          setImportStatus(data);
        }
      } catch (err) {
        console.error("Status poll error:", err);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  }

  // Add tag
  function handleAddTag() {
    if (tagInput.trim() && !defaultTags.includes(tagInput.trim())) {
      setDefaultTags([...defaultTags, tagInput.trim()]);
      setTagInput("");
    }
  }

  // Remove tag
  function handleRemoveTag(tag: string) {
    setDefaultTags(defaultTags.filter((t) => t !== tag));
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Contacts</h1>
        <p className="text-sm text-gray-600 mt-1">
          Upload any messy spreadsheet and SmartSend will turn it into clean, enriched, tagged contacts ready for outreach.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5, 6, 7].map((s) => (
            <div
              key={s}
              className={`flex items-center ${
                s < 7 ? "flex-1" : ""
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step >= s
                    ? "bg-black text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {s}
              </div>
              {s < 7 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    step > s ? "bg-black" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload File */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Upload File</h2>
              <p className="text-sm text-gray-600">
                Upload CSV or XLSX file. Drag & drop or click to browse.
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer block"
              >
                {file ? (
                  <div className="space-y-2">
                    <div className="font-semibold">{file.name}</div>
                    <div className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📄</div>
                    <div className="text-sm text-gray-600">
                      Click to upload or drag & drop
                    </div>
                  </div>
                )}
              </label>
            </div>

            <button
              onClick={handleFileUpload}
              disabled={!file || loading}
              className="w-full px-4 py-2 bg-black text-white rounded-lg font-semibold disabled:opacity-40"
            >
              {loading ? "Processing..." : "Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Field Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Map Fields</h2>
              <p className="text-sm text-gray-600">
                SmartSend auto-detected some fields. Adjust as needed.
              </p>
            </div>

            <div className="space-y-3">
              {headers.map((header) => (
                <div
                  key={header}
                  className="flex items-center justify-between gap-4 p-3 border rounded-lg"
                >
                  <div className="font-medium text-sm">{header}</div>
                  <select
                    value={mapping[header] || ""}
                    onChange={(e) =>
                      setMapping({ ...mapping, [header]: e.target.value })
                    }
                    className="border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs"
                  >
                    <option value="">Ignore</option>
                    {SYSTEM_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} {f.required && "*"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {!mapping[Object.keys(mapping).find((h) => mapping[h] === "email") || ""] && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ Email field is required. Please map a column to Email.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border rounded-lg font-semibold"
              >
                Back
              </button>
              <button
                onClick={handlePreview}
                disabled={
                  !mapping[Object.keys(mapping).find((h) => mapping[h] === "email") || ""] ||
                  loading
                }
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-semibold disabled:opacity-40"
              >
                {loading ? "Previewing..." : "Preview Import"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && preview && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Preview</h2>
              <p className="text-sm text-gray-600">
                Review the first 25 rows. Check validation flags and enrichment.
              </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-700">
                  {preview.summary.validRows}
                </div>
                <div className="text-xs text-green-600">Valid</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-700">
                  {preview.summary.invalidRows}
                </div>
                <div className="text-xs text-red-600">Invalid</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-700">
                  {preview.summary.duplicates}
                </div>
                <div className="text-xs text-blue-600">Duplicates</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-700">
                  {preview.summary.willEnrich}
                </div>
                <div className="text-xs text-purple-600">Will Enrich</div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 10).map((row) => (
                    <tr key={row.rowNumber} className="border-t">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        {row.mappedData.email || (
                          <span className="text-red-600">Missing</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.mappedData.first_name} {row.mappedData.last_name}
                      </td>
                      <td className="px-3 py-2">
                        {row.validation.isValid ? (
                          <span className="text-green-600">✓ Valid</span>
                        ) : (
                          <span className="text-red-600">✗ Invalid</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.validation.isMissingEmail && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                              No Email
                            </span>
                          )}
                          {row.validation.isInvalidEmail && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                              Invalid
                            </span>
                          )}
                          {row.validation.isDuplicate && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              Duplicate
                            </span>
                          )}
                          {row.enrichment.willEnrichCity && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                              Enrich
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 border rounded-lg font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSummary}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-semibold"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Lists & Tags */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Choose Lists & Tags</h2>
              <p className="text-sm text-gray-600">
                Add contacts to a list and apply default tags.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Add to List
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="New list name (e.g., 'Tacoma Storm Leads')"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <p className="text-xs text-gray-500">
                    Leave empty to skip list assignment
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add tag (e.g., 'Google Leads')"
                    className="flex-1 border rounded-lg px-3 py-2"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-gray-100 rounded-lg font-semibold"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {defaultTags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 border rounded-lg font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSummary}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-semibold"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Summary */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Import Summary</h2>
              <p className="text-sm text-gray-600">
                Review your import settings before starting.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Rows</span>
                <span className="font-semibold">{rows.length}</span>
              </div>
              {listName && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">List</span>
                  <span className="font-semibold">{listName}</span>
                </div>
              )}
              {defaultTags.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tags</span>
                  <span className="font-semibold">
                    {defaultTags.join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(4)}
                className="px-4 py-2 border rounded-lg font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-semibold disabled:opacity-40"
              >
                {loading ? "Starting..." : "Start Import"}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Progress */}
        {step === 6 && importStatus && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Importing...</h2>
              <p className="text-sm text-gray-600">
                Processing contacts with enrichment, auto-tagging, and duplicate detection.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>
                  {importStatus.processed_rows} / {importStatus.total_rows}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-black h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      importStatus.total_rows > 0
                        ? (importStatus.processed_rows / importStatus.total_rows) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-semibold text-green-700">
                  {importStatus.imported_count || 0}
                </div>
                <div className="text-gray-600">Imported</div>
              </div>
              <div>
                <div className="font-semibold text-blue-700">
                  {importStatus.merged_count || 0}
                </div>
                <div className="text-gray-600">Merged</div>
              </div>
              <div>
                <div className="font-semibold text-yellow-700">
                  {importStatus.skipped_count || 0}
                </div>
                <div className="text-gray-600">Skipped</div>
              </div>
              <div>
                <div className="font-semibold text-red-700">
                  {importStatus.invalid_count || 0}
                </div>
                <div className="text-gray-600">Invalid</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Completion */}
        {step === 7 && importResults && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Import Complete!</h2>
              <p className="text-sm text-gray-600">
                Your contacts have been imported, enriched, and tagged.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-3xl font-bold text-green-700 mb-4">
                {importResults.summary.imported_count} contacts imported
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Duplicates merged</span>
                  <span className="font-semibold">
                    {importResults.summary.merged_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Invalid emails skipped</span>
                  <span className="font-semibold">
                    {importResults.summary.invalid_count}
                  </span>
                </div>
                {importResults.details.tags_applied &&
                  Object.keys(importResults.details.tags_applied).length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="font-semibold mb-1">Tags Applied</div>
                      {Object.entries(importResults.details.tags_applied).map(
                        ([tag, count]: [string, any]) => (
                          <div key={tag} className="flex justify-between">
                            <span>{tag}</span>
                            <span className="font-semibold">{count}</span>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href="/contacts"
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-semibold text-center"
              >
                View Contacts
              </a>
              <button
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setRows([]);
                  setMapping({});
                  setPreview(null);
                  setImportId(null);
                  setImportStatus(null);
                  setImportResults(null);
                }}
                className="px-4 py-2 border rounded-lg font-semibold"
              >
                Import More
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

