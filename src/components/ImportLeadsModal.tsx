"use client";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { downloadTextFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; campaignId: string };
type ColMapKey = "email" | "first_name" | "last_name" | "company" | "title" | "custom1" | "custom2";

const REQUIRED: ColMapKey[] = ["email"];
const FIELDS: ColMapKey[] = ["email", "first_name", "last_name", "company", "title", "custom1", "custom2"];

export default function ImportLeadsModal({ open, onOpenChange, campaignId }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<ColMapKey, string>>({
    email: "email",
    first_name: "first_name",
    last_name: "last_name",
    company: "company",
    title: "title",
    custom1: "custom1",
    custom2: "custom2",
  });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const onChooseFile = (f: File) => {
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res: any) => {
        const data = res.data as Record<string, string>[];
        setRows(data);
        const cols = (res.meta.fields as string[]) || Object.keys(data[0] ?? {});
        setHeaders(cols);
        // Try to auto-map by common names
        const auto: Record<ColMapKey, string> = { ...mapping };
        FIELDS.forEach(k => {
          const found = cols.find(c => c.toLowerCase().replace(/\s+/g, "") === k);
          if (found) auto[k] = found;
        });
        setMapping(auto);
      },
    });
  };

  const missingRequired = useMemo(() => {
    return REQUIRED.filter(k => !mapping[k] || !headers.includes(mapping[k]));
  }, [mapping, headers]);

  const handleSubmit = async () => {
    if (!file) {
      toast({ title: "No file selected" });
      return;
    }
    if (missingRequired.length) {
      toast({ title: "Missing required fields", description: missingRequired.join(", ") });
      return;
    }
    setLoading(true);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaign_id", campaignId);
      form.append("mapping", JSON.stringify(mapping));

      const res = await fetch("/api/leads/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      setSummary(json);
      if (json.errors_count > 0 && json.error_csv) {
        downloadTextFile("import_errors.csv", json.error_csv);
        toast({ title: "Imported with some errors", description: `Inserted ${json.inserted}, ${json.errors_count} errors.` });
      } else {
        toast({ title: "Import complete", description: `Inserted ${json.inserted} leads.` });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setFile(null); setHeaders([]); setRows([]); setSummary(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onChooseFile(e.target.files[0])}
            />
            <Label htmlFor="csv-input" className="cursor-pointer">
              <div className="text-sm">Drop a CSV here or <span className="underline">choose a file</span></div>
            </Label>
            {file && <div className="mt-2 text-xs opacity-70">{file.name}</div>}
          </div>

          {!!headers.length && (
            <div className="grid grid-cols-2 gap-3">
              {(["email", "first_name", "last_name", "company", "title", "custom1", "custom2"] as ColMapKey[]).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="capitalize">{k.replace("_", " ")}</Label>
                  <Select
                    value={mapping[k] ?? ""}
                    onValueChange={(v) => setMapping(m => ({ ...m, [k]: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                      <SelectItem value="">(not mapped)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {!!rows.length && (
            <div className="rounded-lg border p-3 text-xs">
              <div className="mb-2 font-medium">Preview (first 5 rows)</div>
              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {headers.map(h => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {headers.map(h => <td key={h} className="border px-2 py-1">{r[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {summary && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div><b>Inserted:</b> {summary.inserted}</div>
              <div><b>Skipped (existing):</b> {summary.skipped_existing}</div>
              <div><b>Total rows:</b> {summary.total_rows}</div>
              <div><b>Errors:</b> {summary.errors_count}</div>
              {summary.errors_count > 0 && <div className="text-xs opacity-70">An error CSV was downloaded.</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSubmit} disabled={loading || !file}>
            {loading ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ColumnMapper, FieldMap } from '@/components/ColumnMapper';
import { parseCsvFile, buildErrorCsv } from '@/lib/csv';

type ImportResult = { inserted: number; errors: Array<Record<string, any>> };

export function ImportLeadsModal({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (v: boolean) => void; campaignId: string }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [map, setMap] = React.useState<FieldMap>({});
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const onDrop = React.useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    const { headers, rows } = await parseCsvFile(f);
    setHeaders(headers);
    setRows(rows);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] } });

  async function handleImport() {
    if (!file || !map.email) return;
    setBusy(true);
    setProgress(5);
    setResult(null);
    try {
      // Build rows according to mapping
      const mapped = rows.map((r) => {
        const email = map.email ? r[map.email] : '';
        const first_name = map.first_name ? r[map.first_name] : undefined;
        const last_name = map.last_name ? r[map.last_name] : undefined;
        const company = map.company ? r[map.company] : undefined;
        const knownKeys = new Set([map.email, map.first_name, map.last_name, map.company].filter(Boolean) as string[]);
        const meta: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) if (!knownKeys.has(k)) meta[k] = v;
        return { email, first_name, last_name, company, meta };
      });

      setProgress(30);

      const res = await fetch('/api/import-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaignId, rows: mapped }),
      });

      setProgress(70);

      const data = await res.json();
      setResult({ inserted: data.inserted ?? 0, errors: data.errors ?? [] });
      setProgress(100);
    } catch (e) {
      setResult({ inserted: 0, errors: [{ row: null, email: '', reason: 'Unexpected error' }] });
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!result?.errors?.length) return;
    const csv = buildErrorCsv(result.errors);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads (CSV)</DialogTitle>
        </DialogHeader>

        <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer ${isDragActive ? 'bg-muted' : ''}`}>
          <input {...getInputProps()} />
          {file ? (
            <div className="text-sm">
              Selected: <strong>{file.name}</strong> ({rows.length} rows)
            </div>
          ) : (
            <div className="text-sm">Drop your CSV here or click to choose</div>
          )}
        </div>

        {headers.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Map columns</div>
            <ColumnMapper headers={headers} value={map} onChange={setMap} />
          </div>
        )}

        {busy && (
          <div className="space-y-2">
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground">Importing… please keep this tab open.</div>
          </div>
        )}

        {result && (
          <div className="rounded-lg border p-3 text-sm">
            <div>
              <strong>Inserted:</strong> {result.inserted}
            </div>
            <div>
              <strong>Errors:</strong> {result.errors?.length ?? 0}
            </div>
            {!!result.errors?.length && (
              <Button variant="secondary" className="mt-2" onClick={downloadErrors}>
                Download error CSV
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={!file || !map.email || busy}>
            Start Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Papa from "papaparse";

export default function ImportLeadsModal({ campaignId, onDone }:{campaignId:string; onDone:()=>void}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [file, setFile] = useState<File|null>(null);
  const [mapping, setMapping] = useState({ email:"", first_name:"", last_name:"", company:"" });
  const [loading, setLoading] = useState(false);
  const [errorsCsv, setErrorsCsv] = useState<string>("");

  const onFile = (f: File) => {
    setFile(f);
    Papa.parse(f, {
      header: true,
      preview: 25,
      skipEmptyLines: true,
      complete: (res:any) => {
        setPreview(res.data);
        setHeaders(res.meta.fields || []);
      }
    });
  };

  const submit = async () => {
    if (!file || !mapping.email) return alert("Choose file and map email.");
    setLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("campaign_id", campaignId);
    fd.set("mapping", JSON.stringify(mapping));
    const r = await fetch("/api/leads/import", { method:"POST", body: fd });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return alert(j.error || "Import failed");
    if (j.errorCsv) setErrorsCsv(j.errorCsv);
    alert(`Inserted ${j.inserted} of ${j.total}. Errors: ${j.errors}`);
    onDone();
  };

  const downloadErrors = () => {
    const blob = new Blob([errorsCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "errors.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      {headers.length > 0 && (
        <div className="mt-4 space-y-2">
          {["email","first_name","last_name","company"].map(k => (
            <div key={k} className="flex items-center gap-2">
              <label className="w-28 capitalize">{k}{k==="email"?" *":""}</label>
              <select className="border p-1 rounded" value={(mapping as any)[k]}
                onChange={e => setMapping(prev => ({ ...prev, [k]: e.target.value }))}>
                <option value="">{k==="email"?"— select —":"(skip)"}</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <button disabled={loading} onClick={submit} className="mt-4 px-3 py-2 rounded bg-black text-white">
            {loading ? "Importing..." : "Import Leads"}
          </button>
          {errorsCsv && (
            <button onClick={downloadErrors} className="ml-2 px-3 py-2 rounded border">
              Download errors.csv
            </button>
          )}
        </div>
      )}
      {preview.length > 0 && (
        <div className="mt-4 text-sm opacity-80">Previewing first {preview.length} rows.</div>
      )}
    </div>
  );
}


