"use client";
import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const REQUIRED = ["email"] as const;
const OPTIONAL = ["first_name", "last_name", "company"] as const;

type MapKey = typeof REQUIRED[number] | typeof OPTIONAL[number];

export default function CSVImportModal({ workspaceId, campaignId }: { workspaceId: string; campaignId?: string; }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<MapKey, string | null>>({ email: null, first_name: null, last_name: null, company: null });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const hasRequired = useMemo(() => REQUIRED.every((k) => mapping[k] !== null), [mapping]);

  function onFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = (res.meta.fields ?? []).map((h) => String(h));
        setHeaders(hdrs);
        const data = (res.data as any[]).map((r) => Object.fromEntries(hdrs.map((h) => [h, r[h] ?? ""])));
        setRows(data);
        // Auto-map best-effort
        const lower = hdrs.map((h) => h.toLowerCase());
        const find = (keys: string[]) => {
          for (const key of keys) {
            const i = lower.indexOf(key);
            if (i !== -1) return hdrs[i];
          }
          return null;
        };
        setMapping({
          email: find(["email", "e-mail", "work_email"]) as any,
          first_name: find(["first_name", "firstname", "first name"]) as any,
          last_name: find(["last_name", "lastname", "last name"]) as any,
          company: find(["company", "organization", "org"]) as any,
        });
      },
      error: (err) => toast({ variant: "destructive", title: "CSV parse failed", description: String(err) }),
    });
  }

  function mapRows() {
    return rows.map((r) => ({
      email: mapping.email ? r[mapping.email] : "",
      first_name: mapping.first_name ? r[mapping.first_name] : "",
      last_name: mapping.last_name ? r[mapping.last_name] : "",
      company: mapping.company ? r[mapping.company] : "",
    }));
  }

  async function submit() {
    if (!hasRequired) {
      toast({ variant: "destructive", title: "Missing required mappings", description: "Email must be mapped." });
      return;
    }
    setSubmitting(true);
    try {
      const body = { workspace_id: workspaceId, campaign_id: campaignId ?? null, rows: mapRows() };
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      const { inserted, errors, total_received } = json;
      toast({ title: "Import complete", description: `${inserted} inserted • ${errors.length} errors • ${total_received} received` });
      if (errors && errors.length) downloadErrorsCSV(errors);
      setOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: String(e.message || e) });
    } finally {
      setSubmitting(false);
    }
  }

  function downloadErrorsCSV(errors: { rowIndex: number; email?: string; message: string }[]) {
    const csv = Papa.unparse(errors.map((e) => ({ row: e.rowIndex, email: e.email ?? "", error: e.message })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Leads CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files && onFile(e.target.files[0])} />

          {headers.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {["email", "first_name", "last_name", "company"].map((field) => (
                <div key={field} className="space-y-2">
                  <div className="text-sm font-medium capitalize">{field}{field === "email" && <span className="text-red-500"> *</span>}</div>
                  <Select value={(mapping as any)[field] ?? undefined} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="border rounded p-3 max-h-56 overflow-auto text-sm">
              <div className="font-medium mb-2">Preview ({rows.length} rows)</div>
              {rows.slice(0, 5).map((r, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 border-b py-1">
                  <div>{mapping.email ? r[mapping.email] : ""}</div>
                  <div>{mapping.first_name ? r[mapping.first_name] : ""}</div>
                  <div>{mapping.last_name ? r[mapping.last_name] : ""}</div>
                  <div>{mapping.company ? r[mapping.company] : ""}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!hasRequired || submitting} onClick={submit}>{submitting ? "Importing..." : "Import"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const REQUIRED = ["email"] as const;
const OPTIONAL = ["first_name", "last_name", "company"] as const;

type MapKey = typeof REQUIRED[number] | typeof OPTIONAL[number];

export default function CSVImportModal({ workspaceId, campaignId }: { workspaceId: string; campaignId?: string; }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<MapKey, string | null>>({ email: null, first_name: null, last_name: null, company: null });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const hasRequired = useMemo(() => REQUIRED.every((k) => mapping[k] !== null), [mapping]);

  function onFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = (res.meta.fields ?? []).map((h) => String(h));
        setHeaders(hdrs);
        const data = (res.data as any[]).map((r) => Object.fromEntries(hdrs.map((h) => [h, r[h] ?? ""])));
        setRows(data);
        const lower = hdrs.map((h) => h.toLowerCase());
        const find = (keys: string[]) => {
          for (const key of keys) {
            const i = lower.indexOf(key);
            if (i !== -1) return hdrs[i];
          }
          return null;
        };
        setMapping({
          email: find(["email", "e-mail", "work_email"]) as any,
          first_name: find(["first_name", "firstname", "first name"]) as any,
          last_name: find(["last_name", "lastname", "last name"]) as any,
          company: find(["company", "organization", "org"]) as any,
        });
      },
      error: (err) => toast({ variant: "destructive", title: "CSV parse failed", description: String(err) }),
    });
  }

  function mapRows() {
    return rows.map((r) => ({
      email: mapping.email ? r[mapping.email] : "",
      first_name: mapping.first_name ? r[mapping.first_name] : "",
      last_name: mapping.last_name ? r[mapping.last_name] : "",
      company: mapping.company ? r[mapping.company] : "",
    }));
  }

  async function submit() {
    if (!hasRequired) {
      toast({ variant: "destructive", title: "Missing required mappings", description: "Email must be mapped." });
      return;
    }
    setSubmitting(true);
    try {
      const body = { workspace_id: workspaceId, campaign_id: campaignId ?? null, rows: mapRows() };
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      const { inserted, errors, total_received } = json;
      toast({ title: "Import complete", description: `${inserted} inserted • ${errors.length} errors • ${total_received} received` });
      if (errors && errors.length) downloadErrorsCSV(errors);
      setOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: String(e.message || e) });
    } finally {
      setSubmitting(false);
    }
  }

  function downloadErrorsCSV(errors: { rowIndex: number; email?: string; message: string }[]) {
    const csv = Papa.unparse(errors.map((e) => ({ row: e.rowIndex, email: e.email ?? "", error: e.message })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Leads CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files && onFile(e.target.files[0])} />

          {headers.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {["email", "first_name", "last_name", "company"].map((field) => (
                <div key={field} className="space-y-2">
                  <div className="text-sm font-medium capitalize">{field}{field === "email" && <span className="text-red-500"> *</span>}</div>
                  <Select value={(mapping as any)[field] ?? undefined} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="border rounded p-3 max-h-56 overflow-auto text-sm">
              <div className="font-medium mb-2">Preview ({rows.length} rows)</div>
              {rows.slice(0, 5).map((r, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 border-b py-1">
                  <div>{mapping.email ? r[mapping.email] : ""}</div>
                  <div>{mapping.first_name ? r[mapping.first_name] : ""}</div>
                  <div>{mapping.last_name ? r[mapping.last_name] : ""}</div>
                  <div>{mapping.company ? r[mapping.company] : ""}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!hasRequired || submitting} onClick={submit}>{submitting ? "Importing..." : "Import"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// src/components/CsvImportModal.tsx
"use client";

import * as React from "react";
import { useCsvImport } from "@/hooks/useCsvImport";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Mapping = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
};

export function CsvImportModal(props: {
  campaignId: string;
  defaultMapping?: Mapping;
  onClose?: () => void;
}) {
  const { campaignId, defaultMapping, onClose } = props;
  const [file, setFile] = React.useState<File | null>(null);
  const [mapping, setMapping] = React.useState<Mapping>(defaultMapping || {});
  const [errorCsvUrl, setErrorCsvUrl] = React.useState<string | null>(null);

  const { isUploading, progress, result, error, importCsv } = useCsvImport();
  const { push } = useToast();

  async function handleImport() {
    if (!file) {
      push({ title: "No file selected", description: "Please choose a CSV file first.", type: "error" });
      return;
    }
    try {
      const res = await importCsv(file, campaignId, mapping);
      setErrorCsvUrl((res as any).errorCsvUrl || (res as any).error_csv_url || null);

      push({
        title: "Import complete",
        description: `Imported ${(res as any).imported ?? 0} rows${(res as any).errors?.length ? `, ${(res as any).errors.length} errors` : ""}.`,
        type: "success",
      });
    } catch (e: any) {
      push({
        title: "Import failed",
        description: e?.message || "Please try again.",
        type: "error",
      });
    }
  }

  return (
    <div className="w-full max-w-xl rounded-2xl p-6 bg-black text-white border border-gray-800 shadow-sm">
      <h3 className="text-xl font-semibold mb-4">Import Leads (CSV)</h3>

      <div className="space-y-4">
        <div className="grid gap-2">
          <label className="text-sm text-gray-300">CSV File</label>
          <input
            className="mt-1 w-full rounded-xl bg-gray-900 border border-gray-700 p-2"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-gray-300">Column Mapping (optional)</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-xl bg-gray-900 border border-gray-700 p-2"
              placeholder="CSV header for Email"
              value={mapping.email ?? ""}
              onChange={(e) => setMapping((m) => ({ ...m, email: e.target.value }))}
            />
            <input
              className="rounded-xl bg-gray-900 border border-gray-700 p-2"
              placeholder="CSV header for First Name"
              value={mapping.first_name ?? ""}
              onChange={(e) => setMapping((m) => ({ ...m, first_name: e.target.value }))}
            />
            <input
              className="rounded-xl bg-gray-900 border border-gray-700 p-2"
              placeholder="CSV header for Last Name"
              value={mapping.last_name ?? ""}
              onChange={(e) => setMapping((m) => ({ ...m, last_name: e.target.value }))}
            />
            <input
              className="rounded-xl bg-gray-900 border border-gray-700 p-2"
              placeholder="CSV header for Company"
              value={mapping.company ?? ""}
              onChange={(e) => setMapping((m) => ({ ...m, company: e.target.value }))}
            />
          </div>
          <p className="text-xs text-gray-400">
            Leave blank if your CSV already uses: <code>email, first_name, last_name, company</code>.
          </p>
        </div>

        {isUploading ? (
          <div className="space-y-2">
            <div className="h-2 w-full rounded bg-gray-800 overflow-hidden">
              <div className="h-2 bg-yellow-400" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">Uploading & validating…</p>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : null}

        {result ? (
          <div className="rounded-lg border border-gray-800 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Imported</span>
              <span className="font-medium">{result.imported}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Errors</span>
              <span className="font-medium">{result.errors?.length ?? 0}</span>
            </div>

            {!!result.errors?.length && errorCsvUrl ? (
              <div className="mt-3">
                <a
                  href={errorCsvUrl}
                  download="import_errors.csv"
                  className="underline text-sm"
                >
                  Download error CSV
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="rounded-xl px-4 py-2 border border-gray-700 bg-gray-900 text-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isUploading || !file}
            className="rounded-xl px-4 py-2 bg-yellow-400 text-black disabled:opacity-50"
          >
            {isUploading ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}















