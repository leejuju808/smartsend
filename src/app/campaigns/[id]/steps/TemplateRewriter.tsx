"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TemplateRewriterProps = {
  campaignId: string;
  stepNo: number;
  variantId?: string;
  onVariantCreated?: (variantId: string) => void;
};

type Preview = {
  subject: string;
  html: string;
  preview_text: string;
  rationale: string;
};

export default function TemplateRewriter({
  campaignId,
  stepNo,
  variantId,
  onVariantCreated,
}: TemplateRewriterProps) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<
    "friendly" | "professional" | "punchy" | "casual" | "authoritative"
  >("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [reading, setReading] = useState<number>(8);
  const [cta, setCta] = useState<"soft" | "balanced" | "strong">("balanced");
  const [lang, setLang] = useState<string>("English");
  const [avoid, setAvoid] = useState<string>("free, guarantee");
  const [name, setName] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lint, setLint] = useState<number>(0);
  const [variantNew, setVariantNew] = useState<string | null>(null);

  async function rewrite(createNew = true) {
    try {
      setLoading(true);
      setPreview(null);
      setLint(0);
      setVariantNew(null);

      const res = await fetch("/functions/v1/template-rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_no: stepNo,
          variant_id: variantId ?? undefined,
          tone,
          length,
          reading_grade: reading,
          cta_style: cta,
          language: lang,
          preserve_placeholders: true,
          avoid_terms: avoid
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          create_new_variant: createNew,
          variant_name: name || undefined,
        }),
      });

      const payload = await res.json();
      setLoading(false);

      if (!res.ok) {
        throw new Error(typeof payload === "string" ? payload : payload?.error || "Rewrite failed");
      }

      setPreview(payload.preview);
      setLint(payload.lint_score ?? 0);
      const createdId = payload.created_variant_id ?? null;
      setVariantNew(createdId);
      if (createNew && createdId) {
        onVariantCreated?.(createdId);
      }
    } catch (error: any) {
      console.error("Template rewrite failed", error);
      alert(error.message || "Rewrite failed");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        AI Rewrite
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[840px] max-h-[90vh] overflow-auto rounded-2xl bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Smart Template Rewriter</h3>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Tone</div>
                <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="punchy">Punchy</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="authoritative">Authoritative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Length</div>
                <Select value={length} onValueChange={(v) => setLength(v as typeof length)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Reading Grade</div>
                <Input
                  type="number"
                  min={4}
                  max={14}
                  value={reading}
                  onChange={(event) => setReading(Number(event.target.value))}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">CTA Style</div>
                <Select value={cta} onValueChange={(v) => setCta(v as typeof cta)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="strong">Strong</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Language</div>
                <Input value={lang} onChange={(event) => setLang(event.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Avoid Terms (comma-separated)</div>
                <Input value={avoid} onChange={(event) => setAvoid(event.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <div className="mb-1 text-xs text-muted-foreground">New Variant Name (optional)</div>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., AI-PRO-S-0915"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={() => rewrite(false)} variant="outline" disabled={loading}>
                {loading ? "Generating…" : "Preview Only"}
              </Button>
              <Button onClick={() => rewrite(true)} disabled={loading}>
                {loading ? "Generating…" : "Create Variant"}
              </Button>
            </div>

            {preview && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">Subject</div>
                  <div className="text-sm font-medium">{preview.subject}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Preview Text</div>
                  <div className="text-sm">{preview.preview_text || "—"}</div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">Body (HTML)</div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="mb-1 text-xs text-muted-foreground">AI Rationale</div>
                  <Textarea readOnly value={preview.rationale} />
                </div>
                <div className="sm:col-span-2 text-xs">
                  <span className="rounded bg-muted px-2 py-1">Spam score: {lint.toFixed(2)}</span>
                  {variantNew && (
                    <span className="ml-2 rounded bg-emerald-600/10 px-2 py-1 text-emerald-700">
                      Created variant: {variantNew}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}





