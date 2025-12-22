"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast/ToastProvider";

type CSVRow = Record<string, string>;

const REQUIRED_FIELDS = ["email"] as const;
const OPTIONAL_FIELDS = ["first_name", "last_name", "company", "title"] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const MAPPING_SCHEMA = z.object({
  email: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
});

export default function CSVImportDialog({
  campaignId,
  workspaceId,
}: {
  campaignId: string;
  workspaceId: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const parseFile = (file: File) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data || []) as CSVRow[];
        const hs = Object.keys(data[0] || {}).map((h: string) => h.trim());
        setHeaders(hs);
        setRows(data);
        // auto-map common header names
        const auto: Record<string, string> = {};
        for (const f of ALL_FIELDS) {
          const found = hs.find(
            (h: string) => h.toLowerCase() === f || h.toLowerCase().replace(/\s+/g, "_") === f
          );
          if (found) auto[f] = found;
        }
        setMapping(auto);
      },
      error: (e: Error) => {
        push({ type: "error", title: "Parse error", description: e.message });
      },
    });
  };

  const onChooseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };

  const canImport = useMemo(() => {
    if (!rows.length) return false;
    try {
      const parsed = MAPPING_SCHEMA.parse(mapping);
      return !!parsed.email && headers.includes(parsed.email);
    } catch {
      return false;
    }
  }, [mapping, rows.length, headers]);

  const handleImport = async () => {
    if (!canImport) return;
    setLoading(true);
    try {
      // build payload rows with mapped columns
      const payloadRows = rows
        .map((r) => {
          const email = (r[mapping.email!] || "").trim();
          const row = {
            email,
            first_name: (mapping.first_name ? r[mapping.first_name] : "")?.trim() || "",
            last_name: (mapping.last_name ? r[mapping.last_name] : "")?.trim() || "",
            company: (mapping.company ? r[mapping.company] : "")?.trim() || "",
            title: (mapping.title ? r[mapping.title] : "")?.trim() || "",
          };
          return row;
        })
        .filter((r) => r.email);

      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, workspaceId, rows: payloadRows }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Import failed");

      push({
        type: "success",
        title: "Import complete",
        description: `Inserted ${json.inserted}. Skipped (upload dupes: ${json.in_upload_duplicates}, existing: ${json.existing_in_campaign}).`,
      });

      // reset & close
      setOpen(false);
      setRows([]);
      setHeaders([]);
      setMapping({});
      fileRef.current && (fileRef.current.value = "");
    } catch (e: any) {
      push({ type: "error", title: "Import failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>Import CSV</Button>
      {open && (
      <Dialog>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>CSV Lead Importer</DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        <div className="space-y-3">
          <Label>Upload CSV</Label>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onChooseFile}
          />
          {headers.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Detected columns: {headers.join(", ")}
            </p>
          )}
        </div>

        {/* Step 2: Mapping */}
        {headers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALL_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className={REQUIRED_FIELDS.includes(field as any) ? "after:content-['*'] after:ml-1 after:text-red-500" : ""}>
                  {field}
                </Label>
                <Select
                  value={mapping[field] || ""}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [field]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={`${field}-${h}`} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                    {!REQUIRED_FIELDS.includes(field as any) && (
                      <SelectItem value="">(None)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Preview */}
        {preview.length > 0 && (
          <div className="border rounded-lg p-3">
            <div className="text-sm font-medium mb-2">Preview (first 5 rows)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {headers.map((h) => (
                      <th key={`h-${h}`} className="text-left p-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={`r-${i}`} className="border-t">
                      {headers.map((h) => (
                        <td key={`c-${i}-${h}`} className="p-2">{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Required: <span className="font-medium">email</span>. Optional: first_name, last_name, company, title.
          </p>
          <Button disabled={!canImport || loading} onClick={handleImport}>
            {loading ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
      </Dialog>
      )}
    </>
  );
}
