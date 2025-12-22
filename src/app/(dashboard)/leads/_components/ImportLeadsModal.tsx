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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type ParsedRow = Record<string, string>;
type Mapping = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
};

export default function ImportLeadsModal({
  open,
  onOpenChange,
  campaignId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}) {
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ email: "" });
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState<"missing" | "force" | null>(null);
  const [enrichResult, setEnrichResult] = useState<any>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setHeaders([]);
    setSample([]);
    setMapping({ email: "" });
    if (!f) return;

    Papa.parse<ParsedRow>(f, {
      header: true,
      skipEmptyLines: true,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      complete: (res) => {
        const data = (res.data as ParsedRow[]).filter(Boolean);
        setSample(data.slice(0, 5));
        const hdrs = res.meta.fields?.filter(Boolean) ?? [];
        setHeaders(hdrs);
        const guess = hdrs.find((h) => /^(email|e-mail)$/i.test(h)) ?? "";
        setMapping({ email: guess });
        if (data.length === 0) {
          toast({ title: "Parsed 0 rows", description: "File parsed, but no rows found." });
        }
      },
      error: (err) => {
        toast({ title: "Parse error", description: err.message, variant: "destructive" });
      },
    });
  }

  async function handleImport() {
    if (!file || !mapping.email || sample.length === 0) {
      toast({ title: "Missing data", description: "Please select a file and map the email column.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaign_id", campaignId);
      formData.append("mapping", JSON.stringify(mapping));

      const resp = await fetch("/api/import-leads", {
        method: "POST",
        body: formData,
      });

      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.error || "Import failed");
      }

      toast({ 
        title: "Import complete", 
        description: `Inserted: ${json.inserted || 0}, Skipped: ${json.skipped_duplicates || 0}, Failed: ${json.failed || 0}` 
      });

      if (json.error_csv_url) {
        toast({
          title: "Errors detected",
          description: "Some rows failed validation. Download the error CSV to see details.",
          action: (
            <a href={json.error_csv_url} download className="underline">
              Download CSV
            </a>
          ),
        });
      }

      onOpenChange(false);
      // Refresh the leads table by triggering a page reload or refetch
      window.location.reload();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function runEnrichment(force = false) {
    setEnriching(force ? "force" : "missing");
    setEnrichResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/functions/v1/enrich-campaign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ campaign_id: campaignId, force }),
      });

      const text = await res.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!res.ok) {
        const message =
          (payload && typeof payload === "object" && "message" in payload && payload.message) ||
          (typeof payload === "string" ? payload : null) ||
          "Enrichment failed";
        throw new Error(message);
      }

      setEnrichResult(payload);
      toast({
        title: force ? "Force overwrite complete" : "Enrichment complete",
        description: `Processed ${payload?.processed ?? 0} leads${force ? " (forced)" : ""}.`,
      });
    } catch (error: any) {
      toast({
        title: "Enrichment failed",
        description: error?.message ?? "Unable to enrich leads right now.",
        variant: "destructive",
      });
    } finally {
      setEnriching(null);
    }
  }

  const ready = file && mapping.email && sample.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFileChange}
            />
            <Label htmlFor="csv-input" className="cursor-pointer inline-block">
              <div className="text-sm font-medium">Click to choose a CSV</div>
              <div className="text-xs text-muted-foreground mt-1">or drag & drop into this box</div>
            </Label>
            <div className="mt-4 h-20 rounded-xl bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
              {file ? <span>{file.name}</span> : <span>Drop file here</span>}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Map Columns</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Email *</Label>
                  <Select value={mapping.email} onValueChange={(v) => setMapping((m) => ({ ...m, email: v }))}>
                    <SelectTrigger className="mt-1">
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
                <div>
                  <Label>First name</Label>
                  <Select value={mapping.first_name || ""} onValueChange={(v) => setMapping((m) => ({ ...m, first_name: v || undefined }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="(optional)" />
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
                <div>
                  <Label>Last name</Label>
                  <Select value={mapping.last_name || ""} onValueChange={(v) => setMapping((m) => ({ ...m, last_name: v || undefined }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="(optional)" />
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
                <div>
                  <Label>Company</Label>
                  <Select value={mapping.company || ""} onValueChange={(v) => setMapping((m) => ({ ...m, company: v || undefined }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="(optional)" />
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
              </div>
            </div>
          )}

          {sample.length > 0 && (
            <div className="rounded-xl border p-3">
              <div className="text-xs font-medium mb-2">Preview (first 5 rows)</div>
              <div className="overflow-auto text-xs">
                <table className="w-full">
                  <thead>
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left pr-4 py-1">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((r, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => (
                          <td key={h} className="pr-4 py-1">
                            {String(r[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-2xl border p-3 space-y-2">
            <div className="text-sm font-medium">Lead Enrichment (Lite)</div>
            <div className="text-xs text-muted-foreground">
              Guess <code>country</code> from TLD/overrides and set a default timezone per country. No external APIs.
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={enriching !== null}
                onClick={() => runEnrichment(false)}
              >
                {enriching === "missing" ? "Enriching…" : "Enrich Missing"}
              </Button>
              <Button size="sm" disabled={enriching !== null} onClick={() => runEnrichment(true)}>
                {enriching === "force" ? "Overwriting…" : "Force Overwrite"}
              </Button>
            </div>
            {enrichResult && typeof enrichResult === "object" && (
              <div className="text-xs text-muted-foreground">
                Processed: {enrichResult.processed ?? 0} {enrichResult.force ? "(forced)" : ""}.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!ready || loading}>
            {loading ? "Importing…" : "Start Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

