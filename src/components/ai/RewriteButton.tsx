"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  getDraft: () => string;                 // pull current composer text
  setDraft: (text: string) => void;       // replace composer text
  variables?: Record<string, string | undefined>; // { first_name, company, my_name, ... }
};

const TONES = ["professional","friendly","warm","direct","concise","casual"] as const;
const LENGTHS = ["short","medium","long"] as const;
const GOALS = ["book_call","nudge","follow_up","reengage","breakup"] as const;

export function RewriteButton({ getDraft, setDraft, variables = {} }: Props) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<(typeof TONES)[number]>("professional");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("medium");
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("nudge");
  const [personalize, setPersonalize] = useState(true);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const disabled = useMemo(() => !getDraft()?.trim(), [getDraft]);

  async function runRewrite() {
    setLoading(true);
    setVariants([]);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: getDraft(),
          tone,
          length,
          goal,
          personalize,
          variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Rewrite failed");
      setVariants(data.variants || []);
    } catch (e) {
      console.error(e);
      setVariants([`(Error) ${String(e)}`]);
    } finally {
      setLoading(false);
    }
  }

  // ⌥R shortcut to open dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="text-sm border rounded-md px-2 py-1 hover:bg-muted disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Rewrite (⌥R)"
      >
        Rewrite
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-3xl rounded-xl bg-background border p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Rewrite with AI</h3>
              <button className="text-sm opacity-80 hover:opacity-100" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <label className="text-xs flex flex-col gap-1">
                Tone
                <select className="border rounded-md px-2 py-1 text-sm" value={tone} onChange={e=>setTone(e.target.value as any)}>
                  {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs flex flex-col gap-1">
                Length
                <select className="border rounded-md px-2 py-1 text-sm" value={length} onChange={e=>setLength(e.target.value as any)}>
                  {LENGTHS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs flex flex-col gap-1">
                Goal
                <select className="border rounded-md px-2 py-1 text-sm" value={goal} onChange={e=>setGoal(e.target.value as any)}>
                  <option value="book_call">book_call</option>
                  <option value="nudge">nudge</option>
                  <option value="follow_up">follow_up</option>
                  <option value="reengage">reengage</option>
                  <option value="breakup">breakup</option>
                </select>
              </label>
              <label className="text-xs flex items-center gap-2 mt-5">
                <input type="checkbox" checked={personalize} onChange={e=>setPersonalize(e.target.checked)} />
                Personalize
              </label>
            </div>

            <div className="mb-3">
              <button
                type="button"
                onClick={runRewrite}
                disabled={loading}
                className="text-sm border rounded-md px-3 py-1 hover:bg-muted disabled:opacity-50"
              >
                {loading ? "Rewriting..." : "Generate 3 Variants"}
              </button>
              <span className="ml-2 text-xs text-muted-foreground">Uses current draft. Shortcut: ⌥R</span>
            </div>

            <div className="grid gap-3">
              {variants.length === 0 && !loading && (
                <div className="text-sm text-muted-foreground">No variants yet.</div>
              )}
              {variants.map((v, i) => (
                <div key={i} className="border rounded-md p-3">
                  <div className="text-xs mb-2 opacity-70">Variant {i+1}</div>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">{v}</pre>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs border rounded-md px-2 py-1 hover:bg-muted"
                      onClick={() => { setDraft(v); setOpen(false); }}
                    >
                      Use this
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

