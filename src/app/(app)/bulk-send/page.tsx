"use client";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (u:string)=>fetch(u).then(r=>r.json());

export default function BulkSendPage() {
  const [file, setFile] = useState<File|null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [maxAttempts, setMaxAttempts] = useState<number>(5);
  const [result, setResult] = useState<any>(null);
  const [importId, setImportId] = useState<string>("");

  const { data: campaigns } = useSWR("/api/campaigns", fetcher);
  const { data: templates } = useSWR("/api/templates", fetcher);
  const { data: imp } = useSWR(importId ? `/api/imports/${importId}` : null, fetcher, { refreshInterval: 2000 });

  async function submit() {
    if (!file) return alert("Choose CSV");
    const fd = new FormData();
    fd.set("file", file);
    if (campaignId) fd.set("campaignId", campaignId);
    if (templateId) fd.set("templateId", templateId);
    if (scheduledFor) fd.set("scheduledFor", scheduledFor);
    fd.set("maxAttempts", String(maxAttempts));
    const res = await fetch("/api/bulk-enqueue", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok || !j.ok) return alert(j.error || "Upload failed");
    setResult(j);
    setImportId(j.importId);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Bulk Send (CSV)</h1>
      <div className="grid gap-3 border rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm block mb-1">CSV File</label>
            <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0] || null)} />
            <div className="text-xs text-muted-foreground mt-1">
              Required column: <code>to</code>. Optional: <code>subject</code>, <code>html</code> (if no template),
              any other columns become variables (e.g., <code>first_name</code>, <code>company</code>).
            </div>
          </div>
          <div>
            <label className="text-sm block mb-1">Campaign</label>
            <select className="border rounded px-2 py-1 w-full" value={campaignId} onChange={e=>setCampaignId(e.target.value)}>
              <option value="">(No Campaign)</option>
              {(campaigns?.campaigns ?? []).map((c:any)=>(<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="text-sm block mb-1">Template</label>
            <select className="border rounded px-2 py-1 w-full" value={templateId} onChange={e=>setTemplateId(e.target.value)}>
              <option value="">(None — CSV must have subject/html)</option>
              {(templates?.templates ?? []).map((t:any)=>(<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
          <div>
            <label className="text-sm block mb-1">Schedule For (ISO or leave blank)</label>
            <input className="border rounded px-2 py-1 w-full" placeholder="2025-10-24T19:00:00Z" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)} />
          </div>
          <div>
            <label className="text-sm block mb-1">Max Attempts</label>
            <input type="number" className="border rounded px-2 py-1 w-24" value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value || 5))} />
          </div>
        </div>
        <button className="border rounded px-3 py-1 w-fit" onClick={submit}>Upload & Enqueue</button>
      </div>

      {result && (
        <div className="border rounded-xl p-4">
          <div className="text-sm">Import ID: <code>{result.importId}</code></div>
          <div className="text-sm">Total: {result.total} • Enqueued: {result.enqueued} • Failed: {result.failed}</div>
        </div>
      )}

      {imp && (
        <div className="border rounded-xl p-4">
          <h2 className="text-lg font-medium mb-2">Live Progress</h2>
          <div className="text-sm">Status: {imp.status}</div>
          <div className="text-sm">Enqueued: {imp.enqueued_rows} / {imp.total_rows}</div>
          <div className="text-sm">Failed: {imp.failed_rows}</div>
          {imp.status !== "processing" && imp.failed_rows > 0 && (
            <a className="underline text-sm mt-2 inline-block" href={`/api/imports/${importId}/failures`} target="_blank" rel="noreferrer">
              Download failures (CSV)
            </a>
          )}
        </div>
      )}
    </div>
  );
}