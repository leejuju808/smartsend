"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { rewriteTemplate, useVariant } from "./actions";
import { saveAB } from "../ab/actions";

export default function RewriterPage() {
  const { id } = useParams();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("concise");
  const [length, setLength] = useState<"short"|"medium"|"long">("medium");
  const [variants, setVariants] = useState(3);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [abEnabled, setAbEnabled] = useState(false);
  const [savingAB, setSavingAB] = useState(false);

  async function onRewrite() {
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("campaignId", String(id));
      if (templateId) fd.append("templateId", templateId);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("tone", tone);
      fd.append("length", length);
      fd.append("variants", String(variants));
      const res = await rewriteTemplate(null, fd);
      setTemplateId(res.templateId ?? null);
      setResults(res.variants);
      setMsg(`Generated ${res.variants.length} variants`);
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onUseVariant(k: string) {
    try {
      const fd = new FormData();
      fd.append("campaignId", String(id));
      fd.append("templateId", String(templateId));
      fd.append("variant", k);
      await useVariant(null, fd);
      setMsg(`Variant ${k} applied to campaign`);
    } catch (e: any) {
      setMsg(`Error: ${String(e.message ?? e)}`);
    }
  }

  async function onSaveAB() {
    if (!templateId || !selectedA || !selectedB) {
      setMsg("Please select two variants (A and B)");
      return;
    }
    if (selectedA === selectedB) {
      setMsg("Please select two different variants");
      return;
    }
    setSavingAB(true);
    try {
      const fd = new FormData();
      fd.append("campaignId", String(id));
      fd.append("templateId", templateId);
      fd.append("variantA", selectedA);
      fd.append("variantB", selectedB);
      fd.append("enabled", String(abEnabled));
      await saveAB(null, fd);
      setMsg(abEnabled ? "A/B testing enabled" : "A/B testing saved (disabled)");
    } catch (e: any) {
      setMsg(`Error: ${String(e.message ?? e)}`);
    } finally {
      setSavingAB(false);
    }
  }

  return (
    <main className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold">Smart Template Rewriter</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm">Base Subject</label>
          <input className="w-full rounded-xl border px-3 py-2" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g., Quick idea for {{company}}" />

          <label className="block text-sm">Base Body</label>
          <textarea className="w-full h-56 rounded-xl border px-3 py-2" value={body} onChange={e=>setBody(e.target.value)} placeholder="Keep {{first_name}} and other merge tags intact..." />

          <div className="flex gap-3">
            <select className="rounded-xl border px-3 py-2" value={tone} onChange={e=>setTone(e.target.value)}>
              <option value="concise">Concise</option>
              <option value="warm">Warm</option>
              <option value="direct">Direct</option>
              <option value="curious">Curious</option>
            </select>

            <select className="rounded-xl border px-3 py-2" value={length} onChange={e=>setLength(e.target.value as any)}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>

            <input type="number" min={1} max={5} className="w-20 rounded-xl border px-3 py-2" value={variants} onChange={e=>setVariants(Number(e.target.value))} />

            <button disabled={busy} onClick={onRewrite} className="rounded-xl border px-5 py-2 text-sm disabled:opacity-50">{busy ? "Rewriting..." : "Rewrite"}</button>
          </div>
          {msg && <p className="text-sm opacity-80">{msg}</p>}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Variants</h2>
          
          {/* A/B Testing Picker */}
          {results.length >= 2 && (
            <div className="rounded-2xl border p-4 bg-blue-50/50 space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">A/B Testing</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={abEnabled}
                    onChange={(e) => setAbEnabled(e.target.checked)}
                    className="rounded"
                  />
                  Enable
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs opacity-70 mb-1 block">Variant A</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={selectedA || ""}
                    onChange={(e) => setSelectedA(e.target.value)}
                  >
                    <option value="">Choose...</option>
                    {results.map((v) => (
                      <option key={v.variant_key} value={v.variant_key}>
                        {v.variant_key}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-70 mb-1 block">Variant B</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={selectedB || ""}
                    onChange={(e) => setSelectedB(e.target.value)}
                  >
                    <option value="">Choose...</option>
                    {results.map((v) => (
                      <option key={v.variant_key} value={v.variant_key}>
                        {v.variant_key}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={onSaveAB}
                disabled={savingAB || !selectedA || !selectedB}
                className="w-full rounded-xl border px-4 py-2 text-sm bg-blue-600 text-white disabled:opacity-50"
              >
                {savingAB ? "Saving..." : "Save A/B Selection"}
              </button>
            </div>
          )}

          <ul className="grid gap-3">
            {results.map((v, i) => (
              <li key={i} className="rounded-2xl border p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Variant {v.variant_key}</span>
                  <span className="text-xs opacity-70">Score {v.score?.score ?? 0}/100</span>
                </div>
                <div className="text-sm"><span className="font-semibold">Subject:</span> {v.subject}</div>
                <pre className="text-sm whitespace-pre-wrap">{v.body}</pre>
                <div className="flex items-center justify-between">
                  <div className="text-xs opacity-60">
                    WC {v.score?.wordCount} • Avg/Sent {v.score?.avgWordsPerSentence} • Spam hits {v.score?.spamHits}
                  </div>
                  <button onClick={()=>onUseVariant(v.variant_key)} className="rounded-xl border px-4 py-1 text-sm">Use Variant</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs opacity-60">Tip: Keep merge tags like <code>{`{{first_name}}`}</code> intact in your base copy — the rewriter preserves them.</p>
    </main>
  );
}

