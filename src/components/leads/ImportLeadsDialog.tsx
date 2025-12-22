"use client";

import * as React from "react";
import Papa from "papaparse";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { emitLeadsRefresh } from "@/lib/leadsBus";

type MappingState = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  extras: Record<string, string | undefined>;
};

type Props = {
  campaignId: string;
  extraFields?: string[]; // optional DB jsonb keys you want to map, e.g. ["linkedin","title","notes"]
  onImported?: (summary: { inserted: number; skipped: number; errors: number }) => void;
};

export function ImportLeadsDialog({ campaignId, extraFields = [], onImported }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<MappingState>({ extras: {} });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    inserted: number;
    skipped: number;
    errors: number;
    errorCsv?: string | null;
    message?: string;
  }>(null);

  function onPick(f: File) {
    setFile(f);
    setResult(null);
    // peek first row headers client-side for mapping UI
    Papa.parse(f, {
      header: true,
      preview: 1,
      skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        setHeaders(h);
        // try auto-map common names
        autoMap(h);
      },
    });
  }

  function autoMap(h: string[]) {
    const lc = (s: string) => s.toLowerCase().trim();
    const find = (...cands: string[]) => h.find((hh) => cands.includes(lc(hh)));
    setMapping((m) => ({
      ...m,
      email: find("email", "e-mail"),
      first_name: find("first_name", "firstname", "first name", "first"),
      last_name: find("last_name", "lastname", "last name", "last", "surname"),
      company: find("company", "company_name", "organization", "org"),
      extras: Object.fromEntries((extraFields || []).map((k) => [k, undefined])),
    }));
  }

  async function onImport() {
    if (!file) return;
    if (!mapping.email) {
      toast({ title: "Email is required", description: "Map the Email column.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaign_id", campaignId);
      form.append("mapping", JSON.stringify({
        email: mapping.email,
        first_name: mapping.first_name,
        last_name: mapping.last_name,
        company: mapping.company,
        extras: mapping.extras,
      }));

      const res = await fetch("/api/leads/import", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        toast({ title: "Import failed", description: json.error ?? "Unknown error", variant: "destructive" });
      } else {
        setResult(json);
        toast({
          title: "Import complete",
          description: `${json.inserted} leads imported successfully!${json.skipped > 0 || json.errors > 0 ? ` (${json.skipped} skipped, ${json.errors} errors)` : ""}`,
        });
        emitLeadsRefresh();
        onImported?.({ inserted: json.inserted, skipped: json.skipped, errors: json.errors });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!result?.errorCsv) return;
    const blob = new Blob([result.errorCsv], { type: "text/csv;charset=utf-8" });
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
        <Button size="sm">Import Leads</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div className="grid gap-2">
            <Label>CSV File</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) onPick(f);
              }}
            />
            <p className="text-xs text-muted-foreground">Max {Intl.NumberFormat().format(10000)} rows.</p>
          </div>

          {/* Mapping UI */}
          {!!headers.length && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
              <div className="col-span-2">
                <p className="text-sm font-medium">Map CSV columns → Fields</p>
              </div>

              <FieldMap
                label="Email *"
                value={mapping.email}
                onValueChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                headers={headers}
              />
              <FieldMap
                label="First Name"
                value={mapping.first_name}
                onValueChange={(v) => setMapping((m) => ({ ...m, first_name: v }))}
                headers={headers}
              />
              <FieldMap
                label="Last Name"
                value={mapping.last_name}
                onValueChange={(v) => setMapping((m) => ({ ...m, last_name: v }))}
                headers={headers}
              />
              <FieldMap
                label="Company"
                value={mapping.company}
                onValueChange={(v) => setMapping((m) => ({ ...m, company: v }))}
                headers={headers}
              />

              {extraFields.map((k) => (
                <FieldMap
                  key={k}
                  label={`Extra: ${k}`}
                  value={mapping.extras?.[k]}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, extras: { ...(m.extras || {}), [k]: v } }))
                  }
                  headers={headers}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <div className="flex items-center gap-2">
              {result?.errors ? (
                <Button variant="secondary" onClick={downloadErrors}>
                  Download Errors CSV ({result.errors})
                </Button>
              ) : null}
              <Button disabled={!file || busy} onClick={onImport}>
                {busy ? "Importing…" : "Start Import"}
              </Button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Inserted" value={result.inserted} />
                <Stat label="Skipped" value={result.skipped} />
                <Stat label="Errors" value={result.errors} />
              </div>
              {result.message && <p className="mt-2 text-muted-foreground">{result.message}</p>}
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
  onValueChange,
  headers
}: {
  label: string;
  value?: string;
  onValueChange: (v: string) => void;
  headers: string[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger><SelectValue placeholder="— not mapped —" /></SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
