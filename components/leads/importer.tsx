"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StagePayload = {
  id: string;
  headers: string[];
  preview: any[];
};

type Mapping = Record<string, string>;

export function LeadImporter({
  userId,
  campaignId,
}: {
  userId: string;
  campaignId: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<StagePayload | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("user_id", userId);

    const resp = await fetch("/functions/v1/csv-parse", {
      method: "POST",
      body: fd,
    });

    if (!resp.ok) {
      setError("Failed to parse CSV");
      return;
    }

    const parsed = (await resp.json()) as StagePayload;
    setStage(parsed);
  }

  async function doImport() {
    if (!stage) return;
    setImporting(true);
    setError(null);

    const resp = await fetch("/functions/v1/csv-map-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        import_id: stage.id,
        campaign_id: campaignId,
        mapping,
      }),
    });

    if (!resp.ok) {
      setImporting(false);
      setError("Import failed");
      return;
    }

    await resp.json();
    setImporting(false);
    setDone(true);
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/30 p-3">
      <div className="text-sm font-medium">Import Leads (CSV)</div>

      {!file && (
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      )}

      {file && !stage && (
        <Button size="sm" onClick={upload}>
          Upload &amp; Parse
        </Button>
      )}

      {error && <div className="text-xs text-red-500">{error}</div>}

      {stage && !done && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Map your columns</div>
          {["email", "first_name", "last_name", "company"].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-24 capitalize">{key.replace("_", " ")}:</div>
              <Select
                value={mapping[key] ?? ""}
                onValueChange={(value) =>
                  setMapping((prev) => ({ ...prev, [key]: value }))
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {stage.headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button size="sm" onClick={doImport} disabled={importing}>
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>
      )}

      {done && (
        <div className="text-xs font-medium text-green-600">
          ✅ Imported successfully
        </div>
      )}
    </div>
  );
}





