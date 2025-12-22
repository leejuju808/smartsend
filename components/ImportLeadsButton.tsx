"use client";

import * as React from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type CsvHeader = string;

type Mapping = {
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  company?: string;
};

export function ImportLeadsButton({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<CsvHeader[]>([]);
  const [mapping, setMapping] = React.useState<Mapping>({ email: "" });
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{ totalRows: number; accepted: number; rejected: number; errorCsv?: string } | null>(null);

  const onPickFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    if (!f) return;
    Papa.parse(f, {
      header: true,
      preview: 1,
      complete: (res) => {
        if (res.meta?.fields && res.meta.fields.length > 0) {
          setHeaders(res.meta.fields as string[]);
        } else {
          toast({ description: "Couldn't read CSV headers.", variant: "destructive" });
        }
      },
      error: (err) => {
        toast({ description: `Parse error: ${err.message}`, variant: "destructive" });
      },
    });
  };

  const doImport = async () => {
    if (!file) return toast({ description: "Choose a CSV file first." });
    if (!mapping.email) return toast({ description: "Map the Email column (required)." });

    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("campaign_id", campaignId);

    const res = await fetch("/api/leads/import", { method: "POST", body: fd });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast({ description: json?.error || "Import failed", variant: "destructive" });
      return;
    }

    setResult(json);
    toast({ description: `Imported ${json.accepted}/${json.totalRows}. ${json.rejected} rejected.` });

    if (json.rejected === 0) {
      setTimeout(() => setOpen(false), 600);
    }
  };

  const downloadErrorCsv = () => {
    if (!result?.errorCsv) return;
    const blob = new Blob([result.errorCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-2xl">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Leads CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="csv">CSV File</Label>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">Max 10,000 rows. Required column: Email.</p>
          </div>

          {headers.length > 0 && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email *</Label>
                  <Select onValueChange={(v) => setMapping((m) => ({ ...m, email: v }))} value={mapping.email || ""}>
                    <SelectTrigger><SelectValue placeholder="Select email column" /></SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Company</Label>
                  <Select onValueChange={(v) => setMapping((m) => ({ ...m, company: v }))} value={mapping.company || ""}>
                    <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(none)</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Select onValueChange={(v) => setMapping((m) => ({ ...m, first_name: v }))} value={mapping.first_name || ""}>
                    <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(none)</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Select onValueChange={(v) => setMapping((m) => ({ ...m, last_name: v }))} value={mapping.last_name || ""}>
                    <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(none)</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Full Name (fallback)</Label>
                  <Select onValueChange={(v) => setMapping((m) => ({ ...m, name: v }))} value={mapping.name || ""}>
                    <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">(none)</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={doImport} disabled={loading || !file || !mapping.email}>
              {loading ? "Importing..." : "Start Import"}
            </Button>
          </div>

          {result && (
            <div className="rounded-xl border p-3 text-sm">
              <div>Total rows: <b>{result.totalRows}</b></div>
              <div>Accepted: <b>{result.accepted}</b></div>
              <div>Rejected: <b className={result.rejected ? "text-red-600" : ""}>{result.rejected}</b></div>
              {result.rejected > 0 && (
                <div className="mt-2">
                  <Button variant="secondary" onClick={downloadErrorCsv}>Download error CSV</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


