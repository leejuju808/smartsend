"use client";

import * as React from "react";
import Papa from "papaparse";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProgressBar from "@/components/ui/ProgressBar";
import { toast } from "sonner";

type Row = Record<string, string>;

const LeadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  website: z.string().url().optional(),
  custom1: z.string().optional(),
  custom2: z.string().optional(),
  custom3: z.string().optional(),
});

type Lead = z.infer<typeof LeadSchema>;

const FIELDS: Array<keyof Lead> = [
  "email",
  "first_name",
  "last_name",
  "company",
  "title",
  "website",
  "custom1",
  "custom2",
  "custom3",
];

export default function LeadImporter() {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, keyof Lead | "">>({});
  const [campaignId, setCampaignId] = React.useState<string>("");
  const [stage, setStage] = React.useState<"idle"|"mapped"|"ready"|"uploading"|"done">("idle");
  const [progress, setProgress] = React.useState(0);
  const [validPreview, setValidPreview] = React.useState<Lead[]>([]);
  const [invalidCount, setInvalidCount] = React.useState(0);

  const MAX_ROWS = 10_000;

  async function estimateCsvRows(selected: File): Promise<number> {
    const text = await selected.slice(0, 2_000_000).text();
    return text.split(/\r\n|\n/).filter(Boolean).length - 1; // minus header
  }

  const onFile = async (file: File) => {
    setFileName(file.name);
    try {
      const approx = await estimateCsvRows(file);
      if (approx > MAX_ROWS) {
        toast.error(
          `Detected ~${approx.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}. Please split the file and try again.`
        );
        return;
      }
    } catch {}
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const data = (res.data ?? []) as Row[];
        const hdrs = (res.meta.fields ?? []).map((h) => String(h));
        setHeaders(hdrs);
        setRows(data);
        // Auto-guess mapping
        const guess: Record<string, keyof Lead | ""> = {};
        hdrs.forEach((h) => {
          const key = h.toLowerCase();
          if (key.includes("email")) guess[h] = "email";
          else if (key.includes("first")) guess[h] = "first_name";
          else if (key.includes("last")) guess[h] = "last_name";
          else if (key.includes("company") || key.includes("org")) guess[h] = "company";
          else if (key.includes("title") || key.includes("role")) guess[h] = "title";
          else if (key.includes("website") || key.includes("url") || key.includes("domain")) guess[h] = "website";
          else guess[h] = ""; // unmapped
        });
        setMapping(guess);
        setStage("mapped");
      },
      error: (err) => toast.error(err.message),
    });
  };

  const handleMappingChange = (csvHeader: string, field: keyof Lead | "") => {
    const next = { ...mapping, [csvHeader]: field };
    setMapping(next);
  };

  const computePreview = () => {
    // Build rows based on mapping
    const out: Lead[] = [];
    let invalid = 0;
    for (const r of rows) {
      const obj: any = {};
      for (const [csv, field] of Object.entries(mapping)) {
        if (!field) continue;
        obj[field] = (r[csv] ?? "").toString().trim();
      }
      const parsed = LeadSchema.safeParse(obj);
      if (parsed.success) out.push(parsed.data);
      else invalid++;
    }
    setValidPreview(out.slice(0, 25)); // show a peek
    setInvalidCount(invalid);
    if (!Object.values(mapping).includes("email")) {
      toast.error("Email field is required.");
      setStage("mapped");
      return;
    }
    setStage("ready");
  };

  const upload = async () => {
    if (!campaignId) {
      toast.error("Enter a Campaign ID.");
      return;
    }
    setStage("uploading");
    setProgress(0);

    // Filter valid leads only
    const validAll: Lead[] = [];
    for (const r of rows) {
      const obj: any = {};
      for (const [csv, field] of Object.entries(mapping)) {
        if (!field) continue;
        obj[field] = (r[csv] ?? "").toString().trim();
      }
      const parsed = LeadSchema.safeParse(obj);
      if (parsed.success) validAll.push(parsed.data);
    }

    // Chunk to avoid large payloads
    const chunkSize = 500;
    let uploaded = 0;
    for (let i = 0; i < validAll.length; i += chunkSize) {
      const chunk = validAll.slice(i, i + chunkSize);
      const res = await fetch("/api/import-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, leads: chunk }),
      });
      if (!res.ok) {
        const t = await res.text();
        toast.error(`Batch failed: ${t}`);
        setStage("mapped");
        return;
      }
      uploaded += chunk.length;
      setProgress(Math.round((uploaded / validAll.length) * 100));
    }
    setStage("done");
    toast.success(`Imported ${uploaded} lead(s).`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Lead Importer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Campaign */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Campaign ID</Label>
            <Input
              placeholder="e.g., 3a8e455e-... (required)"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value.trim())}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setCampaignId(campaignId)}>
              Use
            </Button>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className="border-dashed border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40"
          onClick={() => document.getElementById("csvInput")?.click()}
        >
          <input
            id="csvInput"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Drag & drop your CSV here or click to select
            </div>
            {fileName ? <div className="text-xs">Loaded: {fileName}</div> : null}
          </div>
        </div>

        {/* Mapping */}
        {stage !== "idle" && (
          <div className="space-y-3">
            <h3 className="font-medium">Map Columns</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {headers.map((h) => (
                <div key={h} className="space-y-1">
                  <Label className="text-xs">{h}</Label>
                  <Select
                    value={mapping[h] ?? ""}
                    onValueChange={(v) => handleMappingChange(h, v as keyof Lead | "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ignore" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(Ignore)</SelectItem>
                      {FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={computePreview}>
                Validate & Preview
              </Button>
            </div>
          </div>
        )}

        {/* Preview */}
        {stage === "ready" && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">{validPreview.length}</span> valid rows shown (first 25).{" "}
              {invalidCount > 0 && (
                <span className="text-muted-foreground">
                  {invalidCount} invalid row(s) (bad email/website) will be skipped.
                </span>
              )}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {FIELDS.map((f) => (
                      <th key={f} className="px-3 py-2 text-left">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validPreview.map((r, i) => (
                    <tr key={i} className="border-t">
                      {FIELDS.map((f) => (
                        <td key={f} className="px-3 py-2">{(r as any)[f] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={upload}>Import</Button>
              {stage === "uploading" && (
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-48"><ProgressBar value={progress} /></div>
                  <span className="text-xs text-muted-foreground">{progress}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="text-sm text-emerald-600">Import complete. You can navigate back to your Leads.</div>
        )}
      </CardContent>
    </Card>
  );
}
