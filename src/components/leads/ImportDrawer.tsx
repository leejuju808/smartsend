"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const KNOWN_FIELDS = [
  { key: "email", label: "Email" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "name", label: "Full Name" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "website", label: "Website" },
];

export function ImportDrawer({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const detect = (hdrs: string[]) => {
    const m: Record<string, string> = {};
    for (const h of hdrs) {
      const c = h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      for (const field of KNOWN_FIELDS) {
        if (c.includes(field.key) || field.label.toLowerCase().replace(/\s+/g, "_") === c) {
          m[h] = field.key;
          break;
        }
      }
    }
    setMapping(m);
  };

  const loadPresets = async () => {
    try {
      const r = await fetch("/api/mapping-presets");
      const j = await r.json();
      setPresets(j.presets || []);
    } catch (e) {
      console.error("Failed to load presets:", e);
    }
  };

  useEffect(() => {
    if (open) {
      loadPresets();
    }
  }, [open]);

  const start = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // Create upload record
      const r = await fetch("/api/leads/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, filename: file.name }),
      });
      const j = await r.json();
      setUploadId(j.uploadId);
      setStoragePath(j.storagePath);

      // Parse first line to detect headers
      const text = await file.text();
      const headLine = text.split("\n")[0] || "";
      const hdrs = headLine.replace(/\r/g, "").split(",").map((s) => s.replace(/^"|"$/g, "").trim());
      setHeaders(hdrs);
      detect(hdrs);
    } catch (e) {
      console.error("Upload error:", e);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const parse = async () => {
    if (!uploadId || !storagePath || !file) return;
    setLoading(true);
    try {
      // Upload file to Supabase storage
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storagePath", storagePath);

      const uploadResponse = await fetch("/api/leads/import/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Storage upload failed");
      }

      // Start parsing
      await fetch("/api/leads/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, storagePath, mapping }),
      });

      // Poll status
      const iv = setInterval(async () => {
        try {
          const r = await fetch(`/api/leads/import/status/${uploadId}`);
          const s = await r.json();
          setStatus(s);
          if (s?.status === "ready") {
            clearInterval(iv);
            const p = await fetch(`/api/leads/import/preview/${uploadId}`);
            const previewData = await p.json();
            setPreview(previewData.rows || []);
          } else if (s?.status === "error") {
            clearInterval(iv);
          }
        } catch (e) {
          console.error("Status check error:", e);
        }
      }, 1000);
    } catch (e) {
      console.error("Parse error:", e);
      alert("Parse failed");
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!uploadId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/leads/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      if (r.ok) {
        setOpen(false);
        window.location.reload();
      } else {
        alert("Commit failed");
      }
    } catch (e) {
      console.error("Commit error:", e);
      alert("Commit failed");
    } finally {
      setLoading(false);
    }
  };

  const savePreset = async () => {
    try {
      await fetch("/api/mapping-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Preset ${new Date().toLocaleDateString()}`, mapping }),
      });
      await loadPresets();
    } catch (e) {
      console.error("Failed to save preset:", e);
    }
  };

  useEffect(() => {
    if (!open) {
      setFile(null);
      setHeaders([]);
      setMapping({});
      setStatus(null);
      setPreview([]);
      setUploadId(null);
      setStoragePath(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
        </DialogHeader>

        {!uploadId && (
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={start} disabled={!file || loading}>
              Upload
            </Button>
          </div>
        )}

        {uploadId && status?.status !== "ready" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Map columns</div>
              {presets.length > 0 && (
                <Select onValueChange={(presetId) => {
                  const preset = presets.find((p) => p.id === presetId);
                  if (preset) setMapping(preset.mapping);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Apply preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-2">
                <div className="w-1/2 text-xs">{h}</div>
                <Select
                  value={mapping[h] || ""}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [h]: v }))
                  }
                >
                  <SelectTrigger className="w-1/2">
                    <SelectValue placeholder="Skip" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Skip</SelectItem>
                    {KNOWN_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={parse} disabled={loading}>
                Validate
              </Button>
              <Button variant="secondary" onClick={savePreset} disabled={loading}>
                Save Preset
              </Button>
              {status && (
                <span className="text-xs flex items-center">
                  Status: <Badge variant="secondary">{status.status}</Badge>
                </span>
              )}
            </div>
          </div>
        )}

        {status?.status === "ready" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Preview (first 50)</div>
            <div className="max-h-64 overflow-auto rounded border p-2 text-xs">
              {preview.map((r: any) => (
                <div key={r.rownum} className="flex justify-between border-b py-1">
                  <span>{r.normalized?.email || "(no email)"}</span>
                  <span>{r.valid ? "✓" : r.errors?.join(", ")}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {status.valid_rows} valid • {status.invalid_rows} invalid of {status.total_rows}
            </div>
            <Button onClick={commit} disabled={!status.valid_rows || loading}>
              Import {status.valid_rows} leads
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

