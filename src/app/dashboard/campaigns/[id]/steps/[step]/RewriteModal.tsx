"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Variant = {
  subject: string;
  body_html: string;
  notes?: string;
};

export default function RewriteModal({
  campaignId,
  stepNo,
  baseSubject,
  baseBodyHtml,
  variables,
}: {
  campaignId: string;
  stepNo: number;
  baseSubject: string;
  baseBodyHtml: string;
  variables: string[];
}) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<"casual" | "professional" | "friendly" | "direct" | "playful">(
    "professional"
  );
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [cta, setCta] = useState<"book_call" | "reply_yes" | "visit_link" | "download" | "custom">(
    "reply_yes"
  );
  const [customCta, setCustomCta] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setVariants([]);
    setError(null);

    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_no: stepNo,
          base_subject: baseSubject,
          base_body_html: baseBodyHtml,
          variables,
          params: {
            tone,
            length,
            cta,
            custom_cta_text: cta === "custom" ? customCta || undefined : undefined,
            variant_count: variantCount,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to run rewrite");
      }

      const data = await res.json();
      setVariants(data.variants || []);
    } catch (err: any) {
      setError(err?.message || "Failed to run rewrite");
    } finally {
      setLoading(false);
    }
  }

  async function attach(idx: number) {
    const v = variants[idx];
    if (!v) return;

    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/steps/${stepNo}/variants/attach`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: `AI-${String(idx + 1)}`,
            subject: v.subject,
            body_html: v.body_html,
            weight: 0.5,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to attach variant");
      }

      alert("Variant attached ✅");
    } catch (err: any) {
      alert(err?.message || "Failed to attach");
    }
  }

  return (
    <>
      <Button className="rounded-2xl" onClick={() => setOpen(true)}>
        Rewrite with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Smart Template Rewriter</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-3 md:col-span-1">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Tone</div>
                <Select value={tone} onValueChange={(v: any) => setTone(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">professional</SelectItem>
                    <SelectItem value="friendly">friendly</SelectItem>
                    <SelectItem value="casual">casual</SelectItem>
                    <SelectItem value="direct">direct</SelectItem>
                    <SelectItem value="playful">playful</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Length</div>
                <Select value={length} onValueChange={(v: any) => setLength(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">short</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="long">long</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">CTA</div>
                <Select value={cta} onValueChange={(v: any) => setCta(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reply_yes">reply “yes”</SelectItem>
                    <SelectItem value="book_call">book a call</SelectItem>
                    <SelectItem value="visit_link">visit link</SelectItem>
                    <SelectItem value="download">download</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
                {cta === "custom" && (
                  <Input
                    className="mt-2"
                    placeholder="Your CTA text…"
                    value={customCta}
                    onChange={(e) => setCustomCta(e.target.value)}
                  />
                )}
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Variants</div>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={variantCount}
                  onChange={(e) => setVariantCount(Number(e.target.value))}
                />
              </div>

              <Button className="mt-2 w-full" onClick={run} disabled={loading}>
                {loading ? "Generating…" : "Generate"}
              </Button>
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            </div>

            <div className="space-y-3 md:col-span-2">
              {variants.length === 0 && !loading ? (
                <div className="text-sm text-muted-foreground">
                  No variants yet. Click Generate.
                </div>
              ) : null}

              {variants.map((v, i) => (
                <div key={i} className="rounded-xl border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">Subject</div>
                  <div className="font-medium">{v.subject}</div>

                  <div className="mt-2 mb-1 text-xs text-muted-foreground">Body</div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: v.body_html }}
                  />

                  {v.notes ? (
                    <div className="mt-2 text-xs text-muted-foreground">{v.notes}</div>
                  ) : null}

                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" onClick={() => attach(i)}>
                      Attach as Variant
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

