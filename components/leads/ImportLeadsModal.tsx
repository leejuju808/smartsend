"use client";

import * as React from "react";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadRow, OptionalField } from "@/types/leads";

type PapaParse = typeof import("papaparse").default;

interface ImportLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

type Mapping = {
  email?: string;
} & Partial<Record<OptionalField, string>>;

export default function ImportLeadsModal({
  open,
  onOpenChange,
  campaignId,
}: ImportLeadsModalProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<LeadRow[]>([]);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<{
    inserted: number;
    failed: number;
    skipped_duplicates?: number;
    file_duplicates?: number;
    errorCsvUrl?: string | null;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const optionalFields: OptionalField[] = [
    "first_name",
    "last_name",
    "full_name",
    "company",
    "title",
    "phone",
    "website",
    "linkedin",
    "notes",
  ];

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setHeaders([]);
      setPreview([]);
      setMapping({});
      setUploading(false);
      setProgress(0);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResult(null);

    try {
      // Dynamic import to avoid SSR issues
      const Papa = (await import("papaparse")).default as PapaParse;

      Papa.parse<LeadRow>(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors?.length) {
            setError(`CSV parse error: ${results.errors[0].message}`);
            return;
          }

          const rows = (results.data || []).filter((r) =>
            Object.values(r).some(Boolean)
          );

          if (rows.length === 0) {
            setError("No data rows found in CSV");
            return;
          }

          const hdrs = Object.keys(rows[0] || {});
          setHeaders(hdrs);
          setPreview(rows.slice(0, 5));

          // Auto-map common headers
          const autoMap: Mapping = {};
          const lowerHeaders = hdrs.map((h) => h.toLowerCase().trim());

          // Email (required)
          const emailIdx = lowerHeaders.findIndex((h) =>
            ["email", "e-mail", "email_address", "work_email"].includes(h)
          );
          if (emailIdx >= 0) autoMap.email = hdrs[emailIdx];

          // Optional fields
          const fieldMap: Record<string, string[]> = {
            first_name: ["first", "first_name", "firstname", "givenname", "fname"],
            last_name: ["last", "last_name", "lastname", "surname", "familyname", "lname"],
            full_name: ["full_name", "fullname", "name"],
            company: ["company", "org", "organization", "employer", "business", "company_name"],
            title: ["title", "job_title", "position", "role"],
            phone: ["phone", "telephone", "mobile", "phone_number"],
            website: ["website", "url", "web", "site"],
            linkedin: ["linkedin", "linkedin_url", "linkedin_profile"],
            notes: ["notes", "note", "comments", "comment"],
          };

          optionalFields.forEach((field) => {
            const candidates = fieldMap[field] || [field];
            const idx = lowerHeaders.findIndex((h) =>
              candidates.includes(h)
            );
            if (idx >= 0) autoMap[field] = hdrs[idx];
          });

          setMapping(autoMap);
        },
        error: (err: Error) => {
          setError(`Failed to parse CSV: ${err.message}`);
        },
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load CSV parser");
    }
  };

  const handleImport = async () => {
    if (!file || !mapping.email) {
      setError("Please select a file and map the email column");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignId", campaignId);
      formData.append("mapping", JSON.stringify(mapping));

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const response = await new Promise<{
        inserted: number;
        failed: number;
        skipped_duplicates?: number;
        file_duplicates?: number;
        errorCsvUrl?: string | null;
      }>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response"));
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || "Import failed"));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("POST", "/api/import-leads");
        xhr.send(formData);
      });

      setResult(response);
      setProgress(100);
    } catch (err: any) {
      setError(err?.message || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadErrorCsv = () => {
    if (result?.errorCsvUrl) {
      window.open(result.errorCsvUrl, "_blank");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 m-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Import Leads from CSV</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">
              Max ~10k rows recommended. First row must be headers.
            </p>
          </div>

          {/* Column Mapping */}
          {headers.length > 0 && (
            <div className="space-y-4">
              <Label>Map Columns</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Required: Email */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={mapping.email || ""}
                    onValueChange={(value) =>
                      setMapping({ ...mapping, email: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Optional Fields */}
                {optionalFields.map((field) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-sm font-medium">
                      {field.replace(/_/g, " ").replace(/\b\w/g, (l) =>
                        l.toUpperCase()
                      )}
                    </Label>
                    <Select
                      value={mapping[field] || ""}
                      onValueChange={(value) =>
                        setMapping({
                          ...mapping,
                          [field]: value || undefined,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(none)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">(none)</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <Label>Preview (first 5 rows)</Label>
              <div className="border rounded-lg overflow-auto max-h-48">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left p-2 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        {headers.map((h) => (
                          <td key={h} className="p-2">
                            {row[h] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <Label>Uploading...</Label>
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg bg-gray-50 border p-4 space-y-2">
              <h4 className="font-medium">Import Results</h4>
              <div className="text-sm space-y-1">
                <div>
                  <strong>Inserted:</strong> {result.inserted}
                </div>
                {result.skipped_duplicates !== undefined && (
                  <div>
                    <strong>Skipped (already in campaign):</strong>{" "}
                    {result.skipped_duplicates}
                  </div>
                )}
                {result.file_duplicates !== undefined && (
                  <div>
                    <strong>Duplicates in file:</strong> {result.file_duplicates}
                  </div>
                )}
                <div>
                  <strong>Errors:</strong> {result.failed}
                </div>
              </div>
              {result.errorCsvUrl && (
                <button
                  onClick={downloadErrorCsv}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  Download Error CSV
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => onOpenChange(false)}
                disabled={uploading}
                className="px-4 py-2 rounded-2xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={handleImport}
                disabled={!file || !mapping.email || uploading}
                className="px-4 py-2 rounded-2xl bg-yellow-400 text-black font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Importing..." : "Start Import"}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}

