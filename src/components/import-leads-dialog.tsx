"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { BulkEnrich } from "@/components/leads/BulkEnrich";

type SampleRow = Record<string, string>;

const REQUIRED = ["email"];
const OPTIONAL = ["first_name", "last_name", "name", "company", "title", "domain"];

export default function ImportLeadsDialog({
  workspaceId,
  campaignId,
  onImported,
}: {
  workspaceId: string;
  campaignId?: string | null;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({ email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: any[]; errorCsvHeaders: string[] } | null>(null);
  const [enriching, setEnriching] = useState(false);

  const handlePick = (f: File) => {
    setFile(f);
    Papa.parse<SampleRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as SampleRow[]).filter(Boolean).slice(0, 5);
        const cols = res.meta.fields ?? [];
        setHeaders(cols);
        setSample(rows);
        const lower = cols.map((c) => c.toLowerCase());
        const m: Record<string, string> = {};
        const guess = (key: string, candidates: string[]) => {
          const idx = lower.findIndex((h) => candidates.includes(h));
          if (idx >= 0) m[key] = cols[idx];
        };
        guess("email", ["email", "e-mail", "work email", "business email"]);
        guess("first_name", ["first_name", "firstname", "first name", "given"]);
        guess("last_name", ["last_name", "lastname", "last name", "surname", "family"]);
        guess("name", ["name", "full name", "contact"]);
        guess("company", ["company", "company name", "org", "organization"]);
        guess("title", ["title", "job title", "role", "position"]);
        guess("domain", ["domain", "website", "site", "url"]);
        setMapping((prev) => ({ ...prev, ...m }));
      },
    });
  };

  const canSubmit = useMemo(() => {
    if (!file) return false;
    return REQUIRED.every((k) => mapping[k]);
  }, [file, mapping]);

  const onSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("workspace_id", workspaceId);
      if (campaignId) fd.append("campaign_id", campaignId);
      fd.append("mapping", JSON.stringify(mapping));

      const res = await fetch("/api/leads/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      setResult(json);
      toast({ title: "Import finished", description: `Inserted ${json.inserted}, Failed ${json.failed}` });
      if (json.inserted > 0) onImported?.();
    } catch (e: any) {
      toast({ title: "Import error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadErrors = () => {
    if (!result || !result.errors?.length) return;
    const headers = result.errorCsvHeaders || ["row", "email", "error"];
    const lines = [headers.join(",")].concat(
      result.errors.map((e: any) => headers.map((h) => String(e[h] ?? "")?.replaceAll('"', '""')).map((v) => `"${v}"`).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">Import Leads (CSV)</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Upload CSV</Label>
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handlePick(e.target.files[0])} />
          <p className="text-xs text-muted-foreground">Tip: Max {10_000.toLocaleString()} rows. Required column: <b>email</b>.</p>
        </div>

        {!!headers.length && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {REQUIRED.concat(OPTIONAL).map((field) => (
              <div key={field} className="space-y-2">
                <Label className={REQUIRED.includes(field) ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}>{field}</Label>
                <Select value={mapping[field] || ""} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="(not mapped)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">(not mapped)</SelectItem>
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
        )}

        {!!sample.length && (
          <div className="border rounded-md p-3">
            <div className="text-sm font-medium mb-2">Sample (first 5 rows)</div>
            <div className="overflow-auto max-h-48 text-xs">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((r, i) => (
                    <tr key={i} className="odd:bg-muted/30">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Post-import enrichment prompt */}
        {result && result.inserted > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
            <div className="text-sm font-medium text-blue-900">
              Imported {result.inserted.toLocaleString()} lead{result.inserted !== 1 ? 's' : ''}. Enrich now to pull company, LinkedIn, and tech stack.
            </div>
            {campaignId && (
              <div className="flex items-center gap-2">
                <BulkEnrich 
                  campaignId={campaignId} 
                  selectedIds={[]} 
                  onDone={() => setEnriching(true)} 
                />
                <span className="text-xs text-blue-700">This will enrich all leads in this campaign</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {result && (
              <>
                Inserted: <b>{result.inserted}</b> · Failed: <b>{result.failed}</b>{" "}
                {result.failed > 0 && (
                  <Button variant="outline" size="sm" className="ml-2" onClick={downloadErrors}>
                    Download error CSV
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="space-x-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button disabled={!canSubmit || submitting} onClick={onSubmit}>
              {submitting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


