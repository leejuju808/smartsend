"use client";

import * as React from "react";
import Papa from "papaparse";
import { z } from "zod";
import { leadRowSchema } from "@/src/lib/validators/lead";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type RawRow = Record<string, string>;

const mappingSchema = z.object({
  email: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
});

export function LeadImportSheet({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<RawRow[]>([]);
  const [mapping, setMapping] = React.useState<z.infer<typeof mappingSchema>>({ email: "" });
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ inserted: number; errors: number; errorCsv?: string | null } | null>(null);

  function parseCsv(f: File) {
    Papa.parse<RawRow>(f, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (res) => {
        const data = res.data || [];
        const cols = Object.keys(data[0] || {});
        setHeaders(cols);
        setRawRows(data);
        const lower = cols.reduce<Record<string,string>>((acc, h) => { acc[h.toLowerCase()] = h; return acc; }, {});
        setMapping({
          email: lower["email"] ?? "",
          first_name: lower["first_name"] ?? lower["firstname"] ?? lower["first"] ?? "",
          last_name: lower["last_name"] ?? lower["lastname"] ?? lower["last"] ?? "",
          company: lower["company"] ?? lower["organization"] ?? lower["org"] ?? "",
        });
      },
      error: (err) => {
        toast.error("Failed to parse CSV: " + err.message);
      },
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    if (f) parseCsv(f);
  }

  async function onImport() {
    if (!rawRows.length) {
      toast.error("No rows parsed.");
      return;
    }
    const parsedMapping = mappingSchema.safeParse(mapping);
    if (!parsedMapping.success || !parsedMapping.data.email) {
      toast.error("Please map the Email column.");
      return;
    }

    setBusy(true);
    try {
      const rows = rawRows.map((r) => ({
        email: (r[mapping.email] ?? "").trim(),
        first_name: mapping.first_name ? (r[mapping.first_name] ?? "").trim() : "",
        last_name: mapping.last_name ? (r[mapping.last_name] ?? "").trim() : "",
        company: mapping.company ? (r[mapping.company] ?? "").trim() : "",
      })).filter(r => r.email);

      const valid: any[] = [];
      const invalid: Array<{ rowNumber: number; reason: string; row: any }> = [];
      rows.forEach((r, idx) => {
        const out = leadRowSchema.safeParse(r);
        if (out.success) valid.push(out.data);
        else invalid.push({ rowNumber: idx + 1, reason: "Invalid email", row: r });
      });

      if (valid.length === 0) {
        toast.error("No valid rows after validation.");
        return;
      }

      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, rows: valid }),
      });

      const json = await res.json();
      if (!res.ok || json.ok === false) {
        toast.error(json.message ?? "Import failed");
        setResult({ inserted: 0, errors: json.errors ?? 0, errorCsv: json.errorCsv });
      } else {
        toast.success(`Imported ${json.inserted} lead(s)` + (json.errors ? ` — ${json.errors} error(s)` : ""));
        setResult({ inserted: json.inserted, errors: json.errors, errorCsv: json.errorCsv });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Import error");
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!result?.errorCsv) return;
    const blob = new Blob([result.errorCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead_import_errors_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mappingSelect = (label: string, value: string | undefined, onChange: (v: string) => void) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Choose column" /></SelectTrigger>
        <SelectContent className="max-h-72">
          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          <SelectItem value="">(none)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="default">Import Leads (CSV)</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>CSV Lead Importer</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="border border-dashed rounded-2xl p-6 text-center">
            <Input type="file" accept=".csv,text/csv" onChange={onFileChange} />
            <p className="text-sm text-muted-foreground mt-2">Max 10,000 rows. Required: Email. Optional: First, Last, Company.</p>
          </div>

          {headers.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {mappingSelect("Email *", mapping.email, v => setMapping(m => ({ ...m, email: v })))}
              {mappingSelect("First name", mapping.first_name, v => setMapping(m => ({ ...m, first_name: v })))}
              {mappingSelect("Last name", mapping.last_name, v => setMapping(m => ({ ...m, last_name: v })))}
              {mappingSelect("Company", mapping.company, v => setMapping(m => ({ ...m, company: v })))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {rawRows.length ? `${rawRows.length} row(s) parsed` : "No file parsed yet"}
            </div>
            <div className="space-x-2">
              {result?.errorCsv && (
                <Button variant="secondary" onClick={downloadErrors}>Download errors</Button>
              )}
              <Button disabled={busy || !rawRows.length || !mapping.email} onClick={onImport}>
                {busy ? "Importing…" : "Start Import"}
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-xl border p-3 text-sm">
              <div><b>Inserted:</b> {result.inserted}</div>
              <div><b>Errors:</b> {result.errors}</div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


