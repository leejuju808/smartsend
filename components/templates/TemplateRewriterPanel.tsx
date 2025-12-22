"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles, Copy, ArrowRightLeft } from "lucide-react";

type Variant = {
  id: string;
  text: string;
};

type Props = {
  templateId: string;
  onApplyVariant?: (text: string) => void; // e.g. set editor value
};

export function TemplateRewriterPanel({ templateId, onApplyVariant }: Props) {
  const [tone, setTone] = useState("neutral");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [variantsCount, setVariantsCount] = useState(3);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runRewrite = async () => {
    setLoading(true);
    setError(null);
    setVariants([]);

    try {
      const res = await fetch(`/api/templates/${templateId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          length,
          variants: variantsCount,
          instructions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to rewrite template");
      } else {
        setVariants(json.variants || []);
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Smart Rewriter
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Generate alternative versions of this template with AI.
          </p>
        </div>
        <Badge className="text-[10px]">v1</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* Controls */}
        <div className="space-y-2 border-b border-slate-800 pb-3">
          <div className="flex gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Length</Label>
              <Select
                value={length}
                onValueChange={(v) =>
                  setLength(v as "short" | "medium" | "long")
                }
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Shorter</SelectItem>
                  <SelectItem value="medium">Same</SelectItem>
                  <SelectItem value="long">Slightly longer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Variants</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={variantsCount}
                onChange={(e) =>
                  setVariantsCount(
                    Math.min(5, Math.max(1, Number(e.target.value) || 1))
                  )
                }
                className="h-8 w-20 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">
              Extra instructions (optional)
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="E.g. 'Emphasize speed to lead', 'Make opening line punchier', 'Target VP of Sales at SaaS companies'…"
              className="text-[11px] min-h-[60px]"
            />
          </div>

          <Button
            size="sm"
            className="w-full flex items-center justify-center gap-1"
            disabled={loading}
            onClick={runRewrite}
          >
            <Sparkles className="h-3 w-3" />
            {loading ? "Rewriting…" : "Rewrite with AI"}
          </Button>

          {error && (
            <p className="text-[11px] text-red-400 mt-1">{error}</p>
          )}
        </div>

        {/* Variants */}
        <div className="space-y-2 max-h-[340px] overflow-y-auto">
          {variants.length === 0 && !loading ? (
            <p className="text-[11px] text-muted-foreground">
              No variants generated yet. Configure tone/length and click
              "Rewrite with AI".
            </p>
          ) : (
            variants.map((v, idx) => (
              <div
                key={v.id}
                className={cn(
                  "border rounded-md p-2 bg-slate-950/70 space-y-2"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px]">
                      Variant {idx + 1}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      className="h-7 px-2 text-[11px] flex items-center gap-1"
                      onClick={() => copyToClipboard(v.text)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                    {onApplyVariant && (
                      <Button
                        size="xs"
                        className="h-7 px-2 text-[11px] flex items-center gap-1"
                        onClick={() => onApplyVariant(v.text)}
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Replace template
                      </Button>
                    )}
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {v.text}
                </pre>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}






