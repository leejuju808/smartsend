"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/badge";

type Lead = { id: string; name: string | null; company: string | null; email: string };

export default function Composer({ id }: { id: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<string | undefined>();
  const [preview, setPreview] = useState<{ subject: string; body: string; metrics: any } | null>(null);
  const [to, setTo] = useState("");

  // Load campaign and sample leads
  useEffect(() => {
    (async () => {
      const c = await fetch(`/api/campaigns/${id}`);
      const cj = await c.json();
      const camp = cj.campaign || cj;
      setSubject(camp.subject_template || "");
      setBody(camp.body_template || "");

      const l = await fetch(`/api/campaigns/${id}/leads?limit=20`);
      const lj = await l.json();
      setLeads(lj.rows || []);
      setSelectedLead(lj.rows?.[0]?.id);
    })();
  }, [id]);

  // Auto-save draft (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      await fetch(`/api/campaigns/${id}/save`, {
        method: "POST",
        body: JSON.stringify({ subject_template: subject, body_template: body })
      });
    }, 500);
    return () => clearTimeout(t);
  }, [id, subject, body]);

  // Refresh preview
  useEffect(() => {
    (async () => {
      if (!selectedLead) return setPreview(null);

      const r = await fetch(`/api/campaigns/${id}/preview`, {
        method: "POST",
        body: JSON.stringify({ leadId: selectedLead, subject_template: subject, body_template: body })
      });
      setPreview(await r.json());
    })();
  }, [id, selectedLead, subject, body]);

  const sendTest = async () => {
    const r = await fetch(`/api/campaigns/${id}/test-send`, {
      method: "POST",
      body: JSON.stringify({ to: to || "you@example.com", leadId: selectedLead })
    });
    const j = await r.json();
    alert(j.ok ? "Test sent ✅" : `Failed ❌: ${j.error}`);
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="text-sm opacity-70">
          Use {`{{name}}`}, {`{{company}}`}, {`{{email}}`}. Fallbacks: {`{{name|there}}`}.
        </div>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject template…"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full h-[360px] rounded-md border p-3 text-sm"
          placeholder="Body template…"
        ></textarea>
        <div className="flex items-center gap-2">
          <input
            className="h-9 rounded-md border px-3 text-sm w-72"
            placeholder="Send test to…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            onClick={sendTest}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Send Test
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Live Preview</div>
          <div className="flex items-center gap-2">
            <select
              value={selectedLead}
              onChange={(e) => setSelectedLead(e.target.value)}
              className="h-9 rounded-md border px-2 text-sm"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.email} — {l.company || "—"}
                </option>
              ))}
            </select>
            {preview?.metrics ? (
              <Badge variant="secondary">
                subj {preview.metrics.subjectTokens}t • body {preview.metrics.bodyChars} chars
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border p-4 space-y-2">
          <div className="text-sm opacity-70">Subject</div>
          <div className="text-base">{preview?.subject ?? "—"}</div>
        </div>

        <div className="rounded-2xl border p-4 whitespace-pre-wrap text-sm min-h-[240px]">
          {preview?.body ?? "—"}
        </div>
      </div>
    </div>
  );
}

