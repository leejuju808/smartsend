"use client";
import { useState } from "react";

type Variant = { text?: string; html?: string; spamScore: number };

export default function SmartRewritePanel({
  initialSubject, initialBody, onPick
}: {
  initialSubject?: string;
  initialBody?: string;
  onPick: (val: { subject?: string; body?: string }) => void;
}) {
  const [tone, setTone] = useState("professional");
  const [maxWords, setMaxWords] = useState<number | undefined>(120);
  const [variants, setVariants] = useState(3);
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState<Variant[]>([]);
  const [bodies, setBodies] = useState<Variant[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setLoading(true); setErr(null); setSubs([]); setBodies([]);
    const r = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: initialSubject,
        body: initialBody,
        tone, max_words: maxWords, variants,
        context: "SmartSend cold email to SMB decision-makers"
      })
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error || "Failed");
    setSubs(j.subject || []);
    setBodies(j.body || []);
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-gray-500">Tone</label>
          <select className="block rounded-lg border px-2 py-1" value={tone} onChange={e=>setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
            <option value="casual">Casual</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Max Words</label>
          <input className="block w-24 rounded-lg border px-2 py-1" type="number"
                 value={maxWords ?? 0} onChange={e=>setMaxWords(Number(e.target.value)||undefined)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Variants</label>
          <input className="block w-20 rounded-lg border px-2 py-1" type="number" min={1} max={5}
                 value={variants} onChange={e=>setVariants(Math.max(1, Math.min(5, Number(e.target.value)||3)))} />
        </div>
        <button onClick={go} disabled={loading}
                className="ml-auto rounded-lg border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60">
          {loading ? "Rewriting…" : "Rewrite with AI"}
        </button>
      </div>

      {err && <p className="text-sm text-rose-700">❌ {err}</p>}

      {subs.length > 0 && (
        <div>
          <h4 className="font-medium mt-2 mb-1">Subject Variants</h4>
          <div className="grid gap-2">
            {subs.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div className="text-sm">{v.text}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${v.spamScore>4?'text-rose-600':v.spamScore>1?'text-amber-600':'text-emerald-700'}`}>
                    Spam score: {v.spamScore}
                  </span>
                  <button
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    onClick={()=>onPick({ subject: v.text! })}
                  >Use</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bodies.length > 0 && (
        <div>
          <h4 className="font-medium mt-3 mb-1">Body Variants</h4>
          <div className="grid gap-2">
            {bodies.map((v, i) => (
              <div key={i} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${v.spamScore>4?'text-rose-600':v.spamScore>1?'text-amber-600':'text-emerald-700'}`}>
                    Spam score: {v.spamScore}
                  </span>
                  <button
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    onClick={()=>onPick({ body: v.html! })}
                  >Use</button>
                </div>
                <div className="prose prose-sm mt-2" dangerouslySetInnerHTML={{ __html: v.html! }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}