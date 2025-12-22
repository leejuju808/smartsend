// components/leads/LeadImportModal.tsx
"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import Papa from "papaparse";

type Props = { campaignId: string };

const FIELD_OPTIONS = [
  { key: "email", label: "Email (required)" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "company", label: "Company" },
] as const;

export default function LeadImportModal({ campaignId }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{inserted:number; duplicates:number; errors:number} | null>(null);

  const canSubmit = useMemo(() => file && mapping.email, [file, mapping]);

  function onPickFile(f: File) {
    setFile(f);
    Papa.parse(f, {
      header: true,
      preview: 1,
      complete: (res) => {
        if (res.meta?.fields && Array.isArray(res.meta.fields)) {
          setHeaders(res.meta.fields as string[]);
        }
      }
    });
  }

  async function onSubmit() {
    if (!file) return;
    setUploading(true);
    setProgress(5);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("campaign_id", campaignId);
    fd.append("mapping", JSON.stringify(mapping));

    const resp = await fetch("/api/leads/import", { method: "POST", body: fd });
    setProgress(65);

    const contentType = resp.headers.get("Content-Type") || "";
    const countsHeader = resp.headers.get("X-Import-Counts");

    if (contentType.includes("text/csv")) {
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "import_errors.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (countsHeader) {
        try { setResult(JSON.parse(countsHeader)); } catch {}
      }
    } else {
      const data = await resp.json();
      if (resp.ok) {
        setResult(data);
      } else {
        alert(data.error || "Import failed");
      }
    }
    setProgress(100);
    setUploading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-2xl">Import Leads (CSV)</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads into Campaign</DialogTitle>
        </DialogHeader>

        {/* File picker */}
        <div className="space-y-3">
          <Label>CSV File</Label>
          <div
            className="border-2 border-dashed rounded-2xl p-6 text-center hover:bg-muted cursor-pointer"
            onClick={() => document.getElementById("lead_csv_input")?.click()}
          >
            {file ? (
              <div className="text-sm">Selected: {file.name}</div>
            ) : (
              <div className="text-sm opacity-80">Drag & drop or click to choose CSV</div>
            )}
            <input
              id="lead_csv_input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
          </div>
        </div>

        {/* Mapping */}
        {headers.length > 0 && (
          <div className="space-y-2">
            <Label>Map CSV columns to fields</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELD_OPTIONS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="text-xs opacity-80">{f.label}</div>
                  <Select
                    value={mapping[f.key] || ""}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Choose CSV column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (
                        <SelectItem key={`${f.key}-${h}`} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        {uploading && (
          <div className="space-y-2">
            <div className="text-xs">Uploading & validating…</div>
            <Progress value={progress} />
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-2xl bg-muted p-3 text-sm">
            <div>Inserted: <strong>{result.inserted}</strong></div>
            <div>Duplicates Skipped: <strong>{result.duplicates}</strong></div>
            <div>Errors: <strong>{result.errors}</strong> {result.errors > 0 && "(downloaded CSV)"} </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-2xl">Close</Button>
          <Button onClick={onSubmit} disabled={!canSubmit || uploading} className="rounded-2xl">
            {uploading ? "Importing…" : "Start Import"}
          </Button>
        </div>

        <div className="text-xs opacity-70">
          Guardrails: max 10k rows, dedupes by email within file & per-campaign, invalid rows exported to <code>import_errors.csv</code>.
        </div>
      </DialogContent>
    </Dialog>
  );
}


