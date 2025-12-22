"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";

type Variant = { subject?: string; html?: string };

type Preset = {
  id: string;
  name: string;
  tone: "friendly" | "professional" | "concise" | "assertive" | "warm";
  length: "short" | "medium" | "long";
  cta?: string | null;
  variables?: Record<string, string>;
};

export function RewriterBar({
  campaignId,
  value,
  setValue,
  subject,
  setSubject,
}: {
  campaignId: string;
  value: string;
  setValue: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
}) {
  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [preset, setPreset] = React.useState<string>("");
  const [tone, setTone] = React.useState<"friendly" | "professional" | "concise" | "assertive" | "warm">("professional");
  const [length, setLength] = React.useState<"short" | "medium" | "long">("short");
  const [vars, setVars] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/campaign/${campaignId}/rewrite-presets`)
      .then((r) => r.json())
      .then((j) => setPresets((j.presets ?? []) as Preset[]))
      .catch(() => {});
  }, [campaignId]);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaign/${campaignId}/rewrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          body_html: value,
          preset: preset || undefined,
          tone,
          length,
          goal: "intro",
          context: vars,
          variants: 1,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error ?? "Rewrite failed");
      }
      const v = (j.variants ?? [])[0] as Variant | undefined;
      if (!v) {
        throw new Error("No variant returned");
      }
      setSubject(v.subject || subject);
      setValue(v.html || value);
      toast.success("Rewritten");
    } catch (err: any) {
      toast.error(err?.message ?? "Rewrite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
      <select
        className="rounded border bg-background p-2 text-sm"
        value={preset}
        onChange={(e) => {
          const next = e.target.value;
          setPreset(next);
          const p = presets.find((item) => item.name === next);
          if (p) {
            setTone(p.tone);
            setLength(p.length);
            setVars(p.variables ?? {});
          }
        }}
      >
        <option value="">Preset…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        className="rounded border bg-background p-2 text-sm"
        value={tone}
        onChange={(e) => setTone(e.target.value as typeof tone)}
      >
        <option value="professional">Professional</option>
        <option value="friendly">Friendly</option>
        <option value="concise">Concise</option>
        <option value="assertive">Assertive</option>
        <option value="warm">Warm</option>
      </select>

      <select
        className="rounded border bg-background p-2 text-sm"
        value={length}
        onChange={(e) => setLength(e.target.value as typeof length)}
      >
        <option value="short">Short</option>
        <option value="medium">Medium</option>
        <option value="long">Long</option>
      </select>

      <Input
        className="min-w-[240px]"
        placeholder="vars: key:value, key2:value2"
        defaultValue=""
        onBlur={(e) => {
          const m: Record<string, string> = {};
          e.target.value.split(",").forEach((pair) => {
            const [k, ...rest] = pair.split(":");
            if (k && rest.length) {
              m[k.trim()] = rest.join(":").trim();
            }
          });
          setVars(m);
        }}
      />

      <Button size="sm" onClick={run} disabled={loading}>
        {loading ? "Rewriting…" : "Rewrite"}
      </Button>
    </div>
  );
}

