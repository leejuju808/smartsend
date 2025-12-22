"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/badge";

type SampleRow = Record<string, string>;

const FIELD_OPTIONS = [
  { key: "email", label: "Email (required)", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "company", label: "Company", required: false },
] as const;

interface LeadImporterProps {
  campaignId: string;
  workspaceId: string;
  onSuccess?: (result: { inserted: number; rejected: any[] }) => void;
  onError?: (error: string) => void;
}

export default function LeadImporter({ campaignId, workspaceId, onSuccess, onError }: LeadImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({ email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; rejected: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      const f = acceptedFiles[0];
      setFile(f);
      setError(null);
      setResult(null);
      
      Papa.parse<SampleRow>(f, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = (res.data as SampleRow[]).filter(Boolean).slice(0, 5);
          const cols = res.meta.fields ?? [];
          setHeaders(cols);
          setSample(rows);
          
          // Auto-map common patterns
          const lower = cols.map((c) => c.toLowerCase().trim());
          const m: Record<string, string> = {};
          
          const guess = (key: string, candidates: string[]) => {
            const idx = lower.findIndex((h) => candidates.includes(h));
            if (idx >= 0) m[key] = cols[idx];
          };
          
          guess("email", ["email", "e-mail", "work email", "business email"]);
          guess("first_name", ["first_name", "firstname", "first name", "given"]);
          guess("last_name", ["last_name", "lastname", "last name", "surname", "family"]);
          guess("company", ["company", "company name", "org", "organization"]);
          
          setMapping({ email: m.email || "", first_name: m.first_name || "", last_name: m.last_name || "", company: m.company || "" });
        },
        error: (err) => setError(`Failed to parse CSV: ${err.message}`),
      });
    },
  });

  const canSubmit = useMemo(() => {
    if (!file) return false;
    return !!mapping.email;
  }, [file, mapping]);

  const handleSubmit = async () => {
    if (!file) return;
    
    setSubmitting(true);
    setError(null);
    setResult(null);
    
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("campaign_id", campaignId);
      fd.append("workspace_id", workspaceId);
      fd.append("mapping", JSON.stringify(mapping));

      const res = await fetch("/api/import-leads", { method: "POST", body: fd });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }
      
      setResult(data);
      onSuccess?.(data);
    } catch (e: any) {
      const errMsg = e.message || "Import failed";
      setError(errMsg);
      onError?.(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadRejected = () => {
    if (!result || !result.rejected?.length) return;
    
    const headers = ["row", "email", "reason"];
    const lines = [headers.join(",")].concat(
      result.rejected.map((r: any) => [
        r.row,
        r.email || "",
        r.reason || "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejected_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Import Leads from CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload */}
        <div className="space-y-2">
          <Label>Upload CSV File</Label>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-gray-500">{headers.length} columns detected</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {isDragActive ? "Drop CSV here" : "Drag & drop CSV or click to browse"}
                </p>
                <p className="text-xs text-gray-500">Max 10,000 rows</p>
              </div>
            )}
          </div>
        </div>

        {/* Column Mapping */}
        {headers.length > 0 && (
          <div className="space-y-3">
            <Label>Map CSV Columns</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELD_OPTIONS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label className={field.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}>
                    {field.label}
                  </Label>
                  <Select
                    value={mapping[field.key] || ""}
                    onValueChange={(v) => setMapping((prev) => ({ ...prev, [field.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(Not mapped)</SelectItem>
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

        {/* Sample Preview */}
        {sample.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-medium">
              Preview (first 5 rows)
            </div>
            <div className="overflow-auto max-h-48">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-2 text-gray-900">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-900">{error}</AlertDescription>
          </Alert>
        )}

        {/* Result Display */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-900">
                  Import complete
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {result.inserted} inserted
                  </Badge>
                  {result.rejected.length > 0 && (
                    <Badge variant="destructive">
                      {result.rejected.length} rejected
                    </Badge>
                  )}
                </div>
              </div>
              {result.rejected.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadRejected}>
                  Download Rejected
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => { setFile(null); setHeaders([]); setSample([]); setMapping({ email: "" }); }}>
            Reset
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Importing..." : "Import Leads"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

