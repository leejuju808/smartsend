"use client";
import { useState, useEffect } from "react";
import { previewTemplate } from "./useTemplatePreview";

export function TemplateComposer({ campaignId }: { campaignId?: string }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [to, setTo] = useState("");
  const [varsJson, setVarsJson] = useState<string>('{"first_name":"Alex","company":"Acme"}');
  const [preview, setPreview] = useState<{subject:string; html:string; missing:string[]}|null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.ok) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    }
  }

  async function doPreview() {
    setLoading(true);
    try {
      const vars = JSON.parse(varsJson || "{}");
      const j = await previewTemplate(templateId, vars);
      setPreview({ subject: j.subject, html: j.html, missing: j.missing });
    } catch (e: any) {
      alert(e?.message ?? "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendUsingTemplate() {
    setLoading(true);
    try {
      const vars = JSON.parse(varsJson || "{}");
      const res = await fetch("/api/queue-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, templateId, vars, campaignId })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Queue failed");
      setPreview(null);
      alert("Queued!");
    } catch (e: any) {
      alert(e?.message ?? "Queue failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 border rounded-xl p-4">
      <div className="flex gap-3 items-center">
        <label className="text-sm w-24">Template</label>
        <select className="border rounded px-2 py-1 text-sm flex-1" value={templateId} onChange={e => setTemplateId(e.target.value)}>
          <option value="">Select a template</option>
          {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="flex gap-3 items-center">
        <label className="text-sm w-24">To</label>
        <input className="border rounded px-2 py-1 text-sm flex-1" value={to} onChange={e => setTo(e.target.value)} placeholder="user@example.com" />
      </div>

      <div>
        <label className="text-sm block mb-1">Variables (JSON)</label>
        <textarea className="w-full h-28 border rounded px-2 py-1 text-sm"
          value={varsJson} onChange={e => setVarsJson(e.target.value)} />
        <div className="text-xs text-muted-foreground mt-1">
          Use tokens like <code>{{`{{lead.first_name}}`}}</code>, defaults like <code>{{`{{lead.company|Acme}}`}}</code>, raw HTML via <code>{{`{{{html_block}}}`}}</code>, and conditionals <code>{{`{{#if lead.website}}`}}...{{`{{/if}}`}}</code>.
        </div>
      </div>

      <div className="flex gap-2">
        <button className="border rounded px-3 py-1 text-sm" onClick={doPreview} disabled={!templateId || loading}>
          {loading ? "…" : "Preview"}
        </button>
        <button className="border rounded px-3 py-1 text-sm" onClick={sendUsingTemplate} disabled={!templateId || !to || loading}>
          {loading ? "…" : "Queue Send"}
        </button>
      </div>

      {preview && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground mb-1">Subject</div>
            <div className="font-medium">{preview.subject}</div>
            {preview.missing?.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 mt-2">
                Missing: {preview.missing.join(", ")}
              </div>
            )}
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground mb-1">HTML Preview</div>
            <iframe className="w-full h-64 border rounded" srcDoc={preview.html} />
          </div>
        </div>
      )}
    </div>
  );
}