"use client";

import * as React from "react";
import { DiffEditor } from "@monaco-editor/react";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Controls = {
  tone: "professional" | "friendly" | "concise" | "assertive" | "curious" | "warm" | "direct" | "playful";
  persona: "founder" | "sales_rep" | "consultant" | "recruiter" | "support";
  length: "short" | "medium" | "long";
  gradeLevel: number;
  ctaStyle: "single" | "dual" | "soft";
  rules: string[];
  keepVars: boolean;
};

const defaultControls: Controls = {
  tone: "professional",
  persona: "sales_rep",
  length: "medium",
  gradeLevel: 8,
  ctaStyle: "single",
  rules: [],
  keepVars: true,
};

export function SmartRewriter({
  campaignId,
  stepId,
  initialSubject,
  initialBody,
}: {
  campaignId?: string;
  stepId?: string;
  initialSubject: string;
  initialBody: string;
}) {
  const [controls, setControls] = React.useState<Controls>(defaultControls);
  const [sourceSubject, setSourceSubject] = React.useState(initialSubject);
  const [sourceBody, setSourceBody] = React.useState(initialBody);
  const [outSubject, setOutSubject] = React.useState<string>(initialSubject);
  const [outBody, setOutBody] = React.useState<string>(initialBody);
  const [busy, setBusy] = React.useState(false);

  const rewrite = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          stepId,
          subject: sourceSubject,
          body: sourceBody,
          controls,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Rewrite failed");
      setOutSubject(j.subject);
      setOutBody(j.body);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Rewrite failed");
    } finally {
      setBusy(false);
    }
  };

  const saveVariant = async () => {
    if (!stepId) return;
    const name = prompt("Variant name (e.g., 'Friendly#2 Soft CTA')")?.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/steps/${stepId}/variants/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: "no_reply",
          tone: controls.tone,
          name,
          subject: outSubject,
          body: outBody,
          weight: 1,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      alert("Saved as variant ✅");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Save failed");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="space-y-3 rounded-xl border p-3 lg:col-span-2">
        <h3 className="text-sm font-semibold">Smart Rewriter</h3>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Tone</label>
          <select
            className="h-8 rounded border px-2 text-sm"
            value={controls.tone}
            onChange={(e) => setControls((c) => ({ ...c, tone: e.target.value as Controls["tone"] }))}
          >
            {["professional", "friendly", "concise", "assertive", "curious", "warm", "direct", "playful"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label className="text-xs">Persona</label>
          <select
            className="h-8 rounded border px-2 text-sm"
            value={controls.persona}
            onChange={(e) => setControls((c) => ({ ...c, persona: e.target.value as Controls["persona"] }))}
          >
            {["founder", "sales_rep", "consultant", "recruiter", "support"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <label className="text-xs">Length</label>
          <select
            className="h-8 rounded border px-2 text-sm"
            value={controls.length}
            onChange={(e) => setControls((c) => ({ ...c, length: e.target.value as Controls["length"] }))}
          >
            {["short", "medium", "long"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <label className="text-xs">CTA Style</label>
          <select
            className="h-8 rounded border px-2 text-sm"
            value={controls.ctaStyle}
            onChange={(e) => setControls((c) => ({ ...c, ctaStyle: e.target.value as Controls["ctaStyle"] }))}
          >
            {["single", "dual", "soft"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <Label className="text-xs">
            Grade Level: {controls.gradeLevel}
          </Label>
          <div className="px-1">
            <Slider
              defaultValue={[controls.gradeLevel]}
              min={5}
              max={14}
              step={1}
              onValueChange={(v) => setControls((c) => ({ ...c, gradeLevel: v[0] }))}
            />
          </div>

          <div className="col-span-2 flex items-center justify-between rounded border px-2 py-1">
            <Label className="text-xs">
              Preserve variables ({"{{first_name}}"} etc.)
            </Label>
            <Switch checked={controls.keepVars} onCheckedChange={(v) => setControls((c) => ({ ...c, keepVars: !!v }))} />
          </div>
        </div>

        <textarea
          placeholder="Extra rules (one per line)"
          className="h-24 w-full rounded border p-2 text-sm"
          value={controls.rules.join("\n")}
          onChange={(e) =>
            setControls((c) => ({
              ...c,
              rules: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
            }))
          }
        />

        <button
          className="h-9 w-full rounded-md bg-zinc-900 text-white disabled:opacity-50"
          onClick={rewrite}
          disabled={busy}
          title="Rewrite with AI"
        >
          {busy ? "Rewriting…" : "Rewrite"}
        </button>

        <button
          className="h-9 w-full rounded-md border"
          onClick={saveVariant}
          disabled={busy || !stepId}
          title="Save as A/B variant for this step"
        >
          Save as Variant
        </button>
      </div>

      <div className="space-y-3 lg:col-span-3">
        <div className="space-y-2 rounded-xl border p-3">
          <h4 className="text-sm font-medium">Subject</h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              className="h-9 rounded border px-2 text-sm"
              value={sourceSubject}
              onChange={(e) => setSourceSubject(e.target.value)}
            />
            <input
              className="h-9 rounded border px-2 text-sm"
              value={outSubject}
              onChange={(e) => setOutSubject(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <h4 className="mb-2 text-sm font-medium">Body — Diff (Left: Source, Right: Rewrite)</h4>
          <DiffEditor
            height="420px"
            original={sourceBody}
            modified={outBody}
            language="markdown"
            options={{
              readOnly: false,
              renderSideBySide: true,
              minimap: { enabled: false },
              wordWrap: "on",
            }}
            onChange={(value) => setOutBody(value || "")}
          />
        </div>
      </div>
    </div>
  );
}




