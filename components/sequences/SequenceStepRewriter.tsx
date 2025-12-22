"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/src/components/ui/Label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectItem,
  SelectContent,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Copy, ArrowRightLeft } from "lucide-react";

export function SequenceStepRewriter({
  stepId,
  onApply,
}: {
  stepId: string;
  onApply: (body: string) => void;
}) {
  const [tone, setTone] = useState("neutral");
  const [length, setLength] = useState("medium");
  const [variants, setVariantsCount] = useState(3);
  const [instructions, setInstructions] = useState("");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  const rewrite = async () => {
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch(`/api/sequences/${stepId}/rewrite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tone,
          length,
          variants,
          instructions,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Rewrite failed");
        setLoading(false);
        return;
      }

      setResults(json.variants || []);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || "Unexpected error");
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-1">
          <Sparkles className="h-4 w-4 text-amber-400" />
          AI Rewrite
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        <div className="flex gap-2">
          {/* tone */}
          <div className="flex-1">
            <Label className="text-[11px]">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-8 text-xs">
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

          {/* length */}
          <div className="flex-1">
            <Label className="text-[11px]">Length</Label>
            <Select value={length} onValueChange={setLength}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* variants */}
          <div className="flex-1">
            <Label className="text-[11px]">Variants</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              min={1}
              max={5}
              value={variants}
              onChange={(e) => setVariantsCount(Number(e.target.value))}
            />
          </div>
        </div>

        {/* instructions */}
        <div>
          <Label className="text-[11px]">Extra instructions</Label>
          <Textarea
            className="text-[11px]"
            rows={3}
            placeholder="e.g. Make opening punchier, emphasize value prop, tighten CTA…"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {/* button */}
        <Button
          disabled={loading}
          className="w-full flex gap-1 items-center justify-center"
          onClick={rewrite}
        >
          <Sparkles className="h-3 w-3" />
          {loading ? "Rewriting…" : "Rewrite with AI"}
        </Button>

        {error && <p className="text-[10px] text-red-400">{error}</p>}

        {/* variants */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {results.map((v, i) => (
            <div
              key={v.id}
              className="rounded-md border bg-slate-950/60 p-2 space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-semibold">
                  Variant {i + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[10px] flex gap-1 items-center"
                    onClick={() =>
                      navigator.clipboard.writeText(v.text || "")
                    }
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    size="xs"
                    className="h-6 px-2 text-[10px] flex gap-1 items-center"
                    onClick={() => onApply(v.text)}
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                    Apply
                  </Button>
                </div>
              </div>

              <pre className="whitespace-pre-wrap text-[11px]">
                {v.text}
              </pre>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}






