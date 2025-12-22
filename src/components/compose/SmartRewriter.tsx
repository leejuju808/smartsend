"use client";
import { useState } from "react";

const TONES = ["warm","professional","concise","curious","direct"] as const;

export default function SmartRewriter({
  valueSubject, valueText, valueHtml,
  onApply
}: {
  valueSubject: string; valueText: string; valueHtml: string;
  onApply: (v: {subject:string; text:string; html:string}) => void;
}) {
  const [tone, setTone] = useState<typeof TONES[number]>("warm");
  const [length, setLength] = useState<"short"|"medium"|"long">("short");
  const [variation, setVariation] = useState(0.35);
  const [ps, setPs] = useState(false);
  const [ice, setIce] = useState(false);
  const [forbid, setForbid] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{subject:string;text:string;html:string}|null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function rewrite() {
    setLoading(true);
    setWarnings([]);
    setPreview(null);
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        subject: valueSubject,
        text: valueText,
        html: valueHtml,
        tone, length, variation,
        add_ps: ps,
        add_icebreaker: ice,
        forbid_words: forbid.split(",").map(s=>s.trim()).filter(Boolean),
        industry
      })
    });
    const j = await res.json();
    setLoading(false);
    if (!res.ok) { setWarnings([j.error||"Rewrite failed"]); return; }
    setPreview(j.variant);
    setWarnings(j.warnings||[]);
  }

  return (
    <div className="rounded-2xl border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Smart Rewriter</div>
        <button
          onClick={rewrite}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 disabled:opacity-60">
          {loading ? "Rewriting…" : "Rewrite"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-zinc-400 mb-1">Tone</div>
          <select value={tone} onChange={e=>setTone(e.target.value as any)}
                  className="w-full bg-transparent border border-zinc-700 rounded-xl px-2 py-1">
            {TONES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs text-zinc-400 mb-1">Length</div>
          <select value={length} onChange={e=>setLength(e.target.value as any)}
                  className="w-full bg-transparent border border-zinc-700 rounded-xl px-2 py-1">
            {["short","medium","long"].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <div className="text-xs text-zinc-400 mb-1">Variation</div>
          <input type="range" min={0} max={1} step={0.05} value={variation}
            onChange={e=>setVariation(parseFloat(e.target.value))}
            className="w-full"/>
          <div className="text-[10px] text-zinc-500">Higher = bolder changes</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-zinc-400 mb-1">Industry (optional)</div>
          <input value={industry} onChange={e=>setIndustry(e.target.value)}
                 placeholder="e.g., dental clinics, roofing, SaaS HR"
                 className="w-full bg-transparent border border-zinc-700 rounded-xl px-2 py-1"/>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-zinc-400 mb-1">Forbidden words (comma-separated)</div>
          <input value={forbid} onChange={e=>setForbid(e.target.value)}
                 placeholder="free, guaranteed, click here"
                 className="w-full bg-transparent border border-zinc-700 rounded-xl px-2 py-1"/>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ps} onChange={e=>setPs(e.target.checked)} /> Add P.S.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ice} onChange={e=>setIce(e.target.checked)} /> Add icebreaker
        </label>
      </div>

      {warnings.length > 0 && (
        <div className="text-xs text-amber-400">
          ⚠️ Lint: {warnings.join(" · ")}
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="text-xs text-zinc-400">Subject</div>
          <div className="font-medium mb-2">{preview.subject}</div>
          <div className="text-xs text-zinc-400">Text (fallback)</div>
          <pre className="whitespace-pre-wrap text-sm">{preview.text}</pre>
          {preview.html && (
            <>
              <div className="text-xs text-zinc-400 mt-3">HTML</div>
              <div className="text-sm prose prose-invert max-w-none" dangerouslySetInnerHTML={{__html: preview.html}} />
            </>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={()=>onApply(preview)}
              className="px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20">
              Use this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

