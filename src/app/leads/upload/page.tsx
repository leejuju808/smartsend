"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { parseCSV } from "@/lib/csv/parse";
import { normalizeEmail, normalizePhone } from "@/lib/validators/leads";
import { Upload, FileText, CheckCircle, XCircle, ArrowRight, ArrowLeft } from "lucide-react";

const TARGET_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "company", label: "Company", required: false },
  { key: "title", label: "Title", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "website", label: "Website", required: false },
] as const;

type Step = "upload" | "map" | "preview";

export default function LeadsUploadPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [campaignId, setCampaignId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-map common headers
  const autoMapHeaders = useCallback((headers: string[]) => {
    const autoMapping: Record<string, string> = {};
    headers.forEach((header) => {
      const lower = header.toLowerCase();
      if (lower.includes("email")) autoMapping.email = header;
      else if (lower.includes("first") && (lower.includes("name") || lower.includes("name"))) autoMapping.first_name = header;
      else if (lower.includes("last") && lower.includes("name")) autoMapping.last_name = header;
      else if (lower.includes("company") || lower.includes("organization")) autoMapping.company = header;
      else if (lower.includes("title") || lower.includes("job") || lower.includes("position")) autoMapping.title = header;
      else if (lower.includes("phone") || lower.includes("tel")) autoMapping.phone = header;
      else if (lower.includes("website") || lower.includes("url") || lower.includes("site")) autoMapping.website = header;
    });
    return autoMapping;
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a CSV file");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("CSV file appears to be empty");
        return;
      }

      setCsvData(parsed);
      const autoMapping = autoMapHeaders(parsed.headers);
      setMapping(autoMapping);
      setStep("map");
    } catch (err: any) {
      setError(`Failed to parse CSV: ${err.message}`);
    }
  }, [autoMapHeaders]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  // Preview mapped data
  const previewRows = useMemo(() => {
    if (!csvData) return [];
    return csvData.rows.slice(0, 10).map((row) => {
      const mapped: any = {};
      TARGET_FIELDS.forEach((field) => {
        const csvHeader = mapping[field.key];
        mapped[field.key] = csvHeader ? (row[csvHeader] || "") : "";
      });
      return mapped;
    });
  }, [csvData, mapping]);

  // Validation stats
  const validationStats = useMemo(() => {
    if (!csvData) return { total: 0, valid: 0, invalid: 0 };
    let valid = 0;
    let invalid = 0;
    csvData.rows.forEach((row) => {
      const email = normalizeEmail(row[mapping.email] || "");
      if (email) valid++;
      else invalid++;
    });
    return { total: csvData.rows.length, valid, invalid };
  }, [csvData, mapping]);

  const handleImport = useCallback(async () => {
    if (!file || !csvData) return;

    // Validate email mapping exists
    if (!mapping.email) {
      setError("Email column mapping is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      if (campaignId) {
        formData.append("campaign_id", campaignId);
      }

      const response = await fetch("/api/leads/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }, [file, csvData, mapping, campaignId]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Import Leads from CSV</h1>
            <p className="mt-1 text-sm text-gray-500">Upload a CSV file to import leads into your account</p>
          </div>

          <div className="p-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center space-x-4">
                <div className={`flex items-center ${step === "upload" ? "text-blue-600" : step === "map" || step === "preview" ? "text-green-600" : "text-gray-400"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step === "upload" ? "border-blue-600 bg-blue-50" : step === "map" || step === "preview" ? "border-green-600 bg-green-50" : "border-gray-300"}`}>
                    {step !== "upload" ? <CheckCircle className="w-5 h-5" /> : "1"}
                  </div>
                  <span className="ml-2 text-sm font-medium">Upload</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <div className={`flex items-center ${step === "map" ? "text-blue-600" : step === "preview" ? "text-green-600" : "text-gray-400"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step === "map" ? "border-blue-600 bg-blue-50" : step === "preview" ? "border-green-600 bg-green-50" : "border-gray-300"}`}>
                    {step === "preview" ? <CheckCircle className="w-5 h-5" /> : "2"}
                  </div>
                  <span className="ml-2 text-sm font-medium">Map Columns</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <div className={`flex items-center ${step === "preview" ? "text-blue-600" : "text-gray-400"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step === "preview" ? "border-blue-600 bg-blue-50" : "border-gray-300"}`}>
                    3
                  </div>
                  <span className="ml-2 text-sm font-medium">Preview & Import</span>
                </div>
              </div>
            </div>

            {/* Step 1: Upload */}
            {step === "upload" && (
              <div className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                    dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) handleFileSelect(selectedFile);
                    }}
                  />
                  {!file ? (
                    <div className="space-y-4">
                      <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                      <div>
                        <p className="text-lg font-medium text-gray-900">
                          Drag & drop your CSV file here, or{" "}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-blue-600 hover:text-blue-500 font-medium"
                          >
                            browse
                          </button>
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                          CSV files with email, first_name, last_name, company, title, phone columns
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <FileText className="h-12 w-12 text-green-500 mx-auto" />
                      <div>
                        <p className="text-lg font-medium text-gray-900">{file.name}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setCsvData(null);
                            setMapping({});
                          }}
                          className="text-sm text-blue-600 hover:text-blue-500 mt-2"
                        >
                          Choose different file
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}

                <div className="flex justify-center mt-6">
                  <a
                    href="data:text/csv;charset=utf-8,email,first_name,last_name,company,title,phone,website%0A"
                    download="smartsend_lead_template.csv"
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Download CSV Template
                  </a>
                </div>
              </div>
            )}

            {/* Step 2: Column Mapping */}
            {step === "map" && csvData && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Map CSV Columns</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Select which CSV columns correspond to each field. Email is required.
                  </p>
                  <div className="space-y-3">
                    {TARGET_FIELDS.map((field) => (
                      <div key={field.key} className="flex items-center gap-4">
                        <label className="w-32 text-sm font-medium text-gray-700">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <select
                          value={mapping[field.key] || ""}
                          onChange={(e) => {
                            setMapping((prev) => ({
                              ...prev,
                              [field.key]: e.target.value || undefined,
                            }));
                          }}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— Not mapped —</option>
                          {csvData.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setStep("upload")}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ArrowLeft className="w-4 h-4 inline mr-2" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!mapping.email) {
                        setError("Email column mapping is required");
                        return;
                      }
                      setStep("preview");
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                  >
                    Next: Preview
                    <ArrowRight className="w-4 h-4 inline ml-2" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Preview & Import */}
            {step === "preview" && csvData && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview & Import</h2>
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Total rows:</span>
                        <span className="ml-2 font-medium">{validationStats.total}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Valid:</span>
                        <span className="ml-2 font-medium text-green-600">{validationStats.valid}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Invalid:</span>
                        <span className="ml-2 font-medium text-red-600">{validationStats.invalid}</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Campaign ID */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Optional: Attach to Campaign (Campaign ID)
                    </label>
                    <input
                      type="text"
                      value={campaignId}
                      onChange={(e) => setCampaignId(e.target.value)}
                      placeholder="Leave empty to import leads only"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Preview Table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            {TARGET_FIELDS.filter((f) => mapping[f.key]).map((field) => (
                              <th key={field.key} className="px-4 py-2 text-left font-medium text-gray-700">
                                {field.label}
                              </th>
                            ))}
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {previewRows.map((row, idx) => {
                            const email = normalizeEmail(row.email || "");
                            const isValid = !!email;
                            return (
                              <tr key={idx} className={isValid ? "bg-white" : "bg-red-50"}>
                                {TARGET_FIELDS.filter((f) => mapping[f.key]).map((field) => (
                                  <td key={field.key} className="px-4 py-2 text-gray-900">
                                    {row[field.key] || ""}
                                  </td>
                                ))}
                                <td className="px-4 py-2">
                                  {isValid ? (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {csvData.rows.length > 10 && (
                      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
                        Showing first 10 of {csvData.rows.length} rows
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}

                {result && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800 text-sm">
                      <strong>Import complete!</strong> Inserted {result.inserted} leads, skipped {result.skipped} duplicates.
                    </p>
                  </div>
                )}

                <div className="flex justify-between pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setStep("map")}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ArrowLeft className="w-4 h-4 inline mr-2" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={loading || !mapping.email}
                    className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Importing..." : "Import Leads"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

