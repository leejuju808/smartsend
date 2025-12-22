"use client";

import * as React from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

type ParsedRow = Record<string, string>;
type Mapping = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
};

export default function ImportLeadsDialog({
  campaignId,
  onImported,
}: {
  campaignId: string;
  onImported?: (count: number) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ email: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ successCount: number; errorCount: number; errors?: any[] } | null>(null);

  function onFilePicked(f: File) {
    setFile(f);
    Papa.parse<ParsedRow>(f, {
      header: true,
      skipEmptyLines: true,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      complete: (res) => {
        const data = (res.data as ParsedRow[]).filter(Boolean);
        setRows(data);
        const hdrs = res.meta.fields?.filter(Boolean) ?? [];
        setHeaders(hdrs);
        const guess = hdrs.find((h) => /(^|\s)email(s)?$/i.test(h)) ?? "";
        setMapping((m) => ({ ...m, email: guess || "" }));
        if (data.length === 0) toast({ title: "Parsed 0 rows", description: "File parsed, but no rows found." });
      },
      error: (err) => {
        toast({ title: "Parse error", description: err.message, variant: "destructive" });
      },
    });
  }

  function downloadErrorCsv(errors: any[]) {
    const hdr = ["row", "email", "reason"];
    const lines = [hdr.join(",")];
    for (const e of errors) {
      lines.push([e.row ?? "", e.email ?? "", (e.reason ?? "").replaceAll(",", ";")].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!rows.length) {
      toast({ title: "No rows", description: "No rows to import." });
      return;
    }
    if (!mapping.email) {
      toast({ title: "Map Email", description: "Please map the Email column.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mapping,
          rows,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: json?.error ?? "Import failed.", variant: "destructive" });
        setResult(null);
        return;
      }
      setResult(json);
      if (json.successCount > 0) {
        toast({ title: "Import complete", description: `Imported ${json.successCount} lead(s)` });
        onImported?.(json.successCount);
      }
      if (json.errorCount > 0 && json.errors?.length) {
        toast({ title: `Some rows failed (${json.errorCount})`, description: "Click to download errors." });
      }
    } catch (e: any) {
      toast({ title: "Unexpected error", description: e?.message ?? "Unexpected error.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFilePicked(f);
              }}
            />
            <Label htmlFor="csv-input" className="cursor-pointer inline-block">
              <div className="text-sm font-medium">Click to choose a CSV</div>
              <div className="text-xs text-muted-foreground mt-1">or drag & drop into this box</div>
            </Label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFilePicked(f);
              }}
              className="mt-4 h-20 rounded-xl bg-muted/40 flex items-center justify-center text-xs text-muted-foreground"
            >
              {file ? <span>{file.name}</span> : <span>Drop file here</span>}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Map Columns</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldMap
                  label="Email *"
                  value={mapping.email}
                  headers={headers}
                  onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                  required
                />
                <FieldMap
                  label="First name"
                  value={mapping.first_name ?? ""}
                  headers={headers}
                  onChange={(v) => setMapping((m) => ({ ...m, first_name: v || undefined }))}
                />
                <FieldMap
                  label="Last name"
                  value={mapping.last_name ?? ""}
                  headers={headers}
                  onChange={(v) => setMapping((m) => ({ ...m, last_name: v || undefined }))}
                />
                <FieldMap
                  label="Company"
                  value={mapping.company ?? ""}
                  headers={headers}
                  onChange={(v) => setMapping((m) => ({ ...m, company: v || undefined }))}
                />
                <FieldMap
                  label="Title"
                  value={mapping.title ?? ""}
                  headers={headers}
                  onChange={(v) => setMapping((m) => ({ ...m, title: v || undefined }))}
                />
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-xl border">
              <div className="p-3 text-xs text-muted-foreground">
                Previewing first 5 of {rows.length} rows
              </div>
              <div className="max-h-56 overflow-auto border-t">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left p-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="odd:bg-muted/10">
                        {headers.map((h) => (
                          <td key={h} className="p-2">{r[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground">
              • Max {10_000.toLocaleString()} rows • Duplicates by email (in workspace) are auto-skipped • Errors downloadable as CSV
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              <Button disabled={!rows.length || !mapping.email || loading} onClick={handleImport}>
                {loading ? "Importing..." : "Validate & Import"}
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-xl bg-muted/30 p-3 text-sm">
              <div>Imported: <b>{result.successCount}</b></div>
              <div>Errors: <b>{result.errorCount}</b></div>
              {result.errorCount > 0 && result.errors?.length ? (
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => downloadErrorCsv(result.errors!)}>
                    Download error CSV
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldMap({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className={required ? "after:content-['*'] after:ml-1 after:text-red-500" : ""}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select CSV column" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">— None —</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


