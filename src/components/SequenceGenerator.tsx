"use client";

import { useState } from "react";

type Generated = {
  subject: string;
  messages: { label: "initial"|"followup-1"|"followup-2"|"followup-3"; dayOffset: number; body: string }[];
};

export default function SequenceGenerator({ onInsert }: { onInsert?: (g: Generated) => void }) {
  const [product, setProduct] = useState("");
  const [target, setTarget] = useState("");
  const [company, setCompany] = useState("");
  const [tone, setTone] = useState<"casual"|"professional"|"bold">("professional");
  const [cta, setCta] = useState("Book a 15-min call");
  const [steps, setSteps] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [result, setResult] = useState<Generated|null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, target, company, tone, cta, steps }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setResult(json.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleInsert() {
    if (result && onInsert) onInsert(result);
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <h3 className="text-xl font-semibold mb-2">AI Sequence Generator</h3>
      <p className="text-sm text-neutral-400 mb-4">
        Draft a subject + follow-ups from a short product blurb.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Product / What it does</label>
          <textarea
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 h-28 outline-none focus:ring-2 focus:ring-yellow-400/40"
            placeholder="e.g., SmartSend helps SMBs generate cold email sequences and auto-followups connected to Gmail/Outlook."
            value={product}
            onChange={(e)=>setProduct(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Target audience</label>
          <input
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
            placeholder="RevOps leaders at B2B SaaS, agency owners, etc."
            value={target}
            onChange={(e)=>setTarget(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Your company (optional)</label>
          <input
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
            placeholder="SmartSend AI"
            value={company}
            onChange={(e)=>setCompany(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Tone</label>
          <select
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
            value={tone}
            onChange={(e)=>setTone(e.target.value as any)}
          >
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="bold">Bold</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">CTA</label>
          <input
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
            value={cta}
            onChange={(e)=>setCta(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Total emails</label>
          <input
            type="number"
            min={3}
            max={5}
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
            value={steps}
            onChange={(e)=>setSteps(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={generate}
          disabled={loading || product.length < 10 || target.length < 3}
          className="rounded-2xl bg-yellow-400/90 text-black font-semibold px-4 py-2 hover:bg-yellow-300 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate Sequence"}
        </button>
        {result && (
          <button
            onClick={handleInsert}
            className="rounded-2xl border border-yellow-400/50 text-yellow-300 font-semibold px-4 py-2 hover:bg-yellow-400/10"
          >
            Insert into Composer
          </button>
        )}
      </div>

      {error && <div className="mt-3 text-red-400 text-sm">Error: {error}</div>}

      {result && (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400 mb-1">Subject</div>
            <div className="text-base font-medium">{result.subject}</div>
          </div>
          {result.messages.map((m, i)=>(
            <div key={i} className="rounded-xl border border-neutral-800 p-4">
              <div className="flex items-center justify-between text-sm text-neutral-400 mb-2">
                <span className="capitalize">
                  {m.label.replace("-", " ")}
                </span>
                <span>Send +{m.dayOffset}d</span>
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{m.body}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}