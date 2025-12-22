"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type Controls = {
  tone: "friendly" | "professional" | "concise" | "assertive" | "playful";
  length: "short" | "medium" | "long";
  reading_level: "grade6" | "grade8" | "grade10" | "business";
  cta?: string;
  avoid_phrases?: string[];
  signoff?: string;
};

export default function RewriterDrawer({
  campaignId,
  mode,
  value,
  onApply,
}: {
  campaignId?: string;
  mode: "subject" | "body";
  value: string;
  onApply: (text: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [controls, setControls] = React.useState<Controls>({
    tone: "professional",
    length: "short",
    reading_level: "grade8",
  });
  const [variables, setVariables] = React.useState<Record<string, string>>({});
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [presetId, setPresetId] = React.useState<string | null>(null);
  const [presets, setPresets] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [output, setOutput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !campaignId) {
      setPresets([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/campaign/${campaignId}/rewrites/presets`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!cancelled) {
          setPresets(json.presets ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed loading presets", err);
          setPresets([]);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, campaignId]);

  function applyPreset(p: any) {
    setControls({
      tone: p.tone,
      length: p.length,
      reading_level: p.reading_level,
      cta: p.cta ?? undefined,
      avoid_phrases: p.avoid_phrases ?? [],
      signoff: p.signoff ?? undefined,
    });
    setVariables(p.variables ?? {});
    setPresetId(p.id ?? null);
    setResolved(null);
    setOutput("");
  }

  async function autoFillFromLead() {
    if (!leadId) return;
    try {
      if (presetId) {
        const j = await fetch(
          `/api/presets/${presetId}/vars/hydrate?leadId=${encodeURIComponent(leadId)}`,
        ).then((r) => r.json());
        setVariables((vars) => ({ ...vars, ...(j.vars ?? {}) }));
      } else if (campaignId) {
        const j = await fetch(
          `/api/campaign/${campaignId}/vars/hydrate?leadId=${encodeURIComponent(leadId)}`,
        ).then((r) => r.json());
        setVariables((vars) => ({ ...vars, ...(j.vars ?? {}) }));
      }
    } catch (err) {
      console.warn("Auto-fill from lead failed", err);
    }
  }

  function resolvePreview(text: string, vars: Record<string, string>) {
    return text.replace(/\{\{(.*?)\}\}/g, (_, k) => {
      const key = String(k).trim();
      return vars[key] ?? `{{${key}}}`;
    });
  }

function buildInstruction(controls: Controls, mode: "subject" | "body") {
  const parts: string[] = ["Rewrite this email naturally and clearly."];

  if (controls.length === "short") {
    parts.push("Keep it concise.");
  } else if (controls.length === "medium") {
    parts.push("Aim for a balanced medium-length rewrite.");
  } else if (controls.length === "long") {
    parts.push("Feel free to elaborate where it adds clarity.");
  }

  if (controls.reading_level === "grade6") {
    parts.push("Write at roughly a 6th grade reading level.");
  } else if (controls.reading_level === "grade8") {
    parts.push("Target about an 8th grade reading level.");
  } else if (controls.reading_level === "grade10") {
    parts.push("Target about a 10th grade reading level.");
  } else if (controls.reading_level === "business") {
    parts.push("Use a straightforward business writing style.");
  }

  if (controls.cta) {
    parts.push(`Include this CTA: ${controls.cta}`);
  }

  if (Array.isArray(controls.avoid_phrases) && controls.avoid_phrases.length) {
    parts.push(`Avoid the following phrases: ${controls.avoid_phrases.join(", ")}`);
  }

  if (mode === "body" && controls.signoff) {
    parts.push(`Close with this signoff: ${controls.signoff}`);
  }

  return parts.join(" ");
}

  async function rewrite() {
    setLoading(true);
    setError(null);
    setResolved(null);
    setOutput("");
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          preset_id: presetId ?? undefined,
          lead_id: leadId ?? undefined,
          text: value,
          tone: controls.tone,
          instruction: buildInstruction(controls, mode),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error ?? "Failed to rewrite");
      }
      setVariables(json.hydrated_vars ?? {});
      setResolved(json.resolved_text ?? null);
      const nextOutput = json.output ?? json.text ?? "";
      setOutput(nextOutput);
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" ? err.message : "Rewrite failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Rewrite ({mode})
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30">
          <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Smart Rewriter</div>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mb-3">
              <div className="mb-1 text-xs text-muted-foreground">Presets</div>
              <div className="flex flex-wrap gap-2">
                {presets.map((p: any) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                  </Button>
                ))}
                {!presets.length && (
                  <div className="text-xs text-muted-foreground">
                    No presets yet.
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input
                  className="rounded-md border p-2 text-sm"
                  placeholder="Lead ID (optional)"
                  value={leadId ?? ""}
                  onChange={(e) => setLeadId(e.target.value || null)}
                />
                <input
                  className="rounded-md border p-2 text-sm"
                  placeholder="Preset ID (optional)"
                  value={presetId ?? ""}
                  onChange={(e) => setPresetId(e.target.value || null)}
                />
                <Button variant="outline" onClick={autoFillFromLead} disabled={!leadId}>
                  Auto-fill from lead
                </Button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <select
                className="rounded-md border p-2 text-sm"
                value={controls.tone}
                onChange={(e) =>
                  setControls((c) => ({ ...c, tone: e.target.value as any }))
                }
              >
                <option>friendly</option>
                <option>professional</option>
                <option>concise</option>
                <option>assertive</option>
                <option>playful</option>
              </select>
              <select
                className="rounded-md border p-2 text-sm"
                value={controls.length}
                onChange={(e) =>
                  setControls((c) => ({ ...c, length: e.target.value as any }))
                }
              >
                <option>short</option>
                <option>medium</option>
                <option>long</option>
              </select>
              <select
                className="rounded-md border p-2 text-sm"
                value={controls.reading_level}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    reading_level: e.target.value as any,
                  }))
                }
              >
                <option>grade6</option>
                <option>grade8</option>
                <option>grade10</option>
                <option>business</option>
              </select>
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="CTA (optional)"
                value={controls.cta ?? ""}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    cta: e.target.value || undefined,
                  }))
                }
              />
              {mode === "body" && (
                <input
                  className="rounded-md border p-2 text-sm"
                  placeholder="Signoff (e.g., Best,)"
                  value={controls.signoff ?? ""}
                  onChange={(e) =>
                    setControls((c) => ({
                      ...c,
                      signoff: e.target.value || undefined,
                    }))
                  }
                />
              )}
            </div>

            <div className="mt-2">
              <textarea
                className="w-full rounded-md border p-2 text-sm"
                rows={3}
                placeholder="Avoid phrases (comma-separated)"
                value={(controls.avoid_phrases ?? []).join(", ")}
                onChange={(e) =>
                  setControls((c) => ({
                    ...c,
                    avoid_phrases: e.target.value
                      ? e.target.value.split(",").map((s) => s.trim())
                      : [],
                  }))
                }
              />
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs text-muted-foreground">
                Variables (used as {{var}} in text)
              </div>
              <VarEditor vars={variables} setVars={setVariables} />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button onClick={rewrite} disabled={loading}>
                {loading ? "Rewriting…" : "Rewrite"}
              </Button>
              {output && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onApply(output);
                    setOpen(false);
                  }}
                >
                  Apply
                </Button>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {(resolved || Object.keys(variables).length > 0) && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-muted-foreground">
                  Preview (variables resolved)
                </div>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={8}
                  value={resolved ?? resolvePreview(value, variables)}
                  readOnly
                />
              </div>
            )}

            {output && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-muted-foreground">
                  Suggestion
                </div>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={8}
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VarEditor({
  vars,
  setVars,
}: {
  vars: Record<string, string>;
  setVars: (v: Record<string, string>) => void;
}) {
  const entries = Object.entries(vars);

  function add() {
    const base = "var";
    let idx = 1;
    while (`${base}${idx}` in vars) {
      idx += 1;
    }
    setVars({ ...vars, [`${base}${idx}`]: "" });
  }

  function setKey(i: number, k: string) {
    const value = entries[i]?.[1] ?? "";
    const next: Record<string, string> = {};
    entries.forEach(([key, val], idx) => {
      next[idx === i ? k : key] = idx === i ? value : val;
    });
    setVars(next);
  }

  function setVal(i: number, value: string) {
    const key = entries[i]?.[0];
    if (!key) return;
    setVars({ ...vars, [key]: value });
  }

  function remove(i: number) {
    const key = entries[i]?.[0];
    if (!key) return;
    const next = { ...vars };
    delete next[key];
    setVars(next);
  }

  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="grid grid-cols-5 gap-2">
          <input
            className="col-span-2 rounded-md border p-2 text-sm"
            value={k}
            onChange={(e) => setKey(i, e.target.value)}
          />
          <input
            className="col-span-3 rounded-md border p-2 text-sm"
            value={v}
            onChange={(e) => setVal(i, e.target.value)}
          />
          <button
            className="text-xs text-red-600"
            onClick={() => remove(i)}
            type="button"
          >
            remove
          </button>
        </div>
      ))}
      {!entries.length && (
        <div className="text-xs text-muted-foreground">No variables yet.</div>
      )}
      <button className="text-xs underline" onClick={add} type="button">
        + add variable
      </button>
    </div>
  );
}

