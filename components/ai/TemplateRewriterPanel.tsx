"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractMergeTags } from "@/src/lib/merge-tags";

type Props = {
  subject: string;
  body: string;
  mergeFields?: string[]; // e.g. ["{first_name}", "{company}"]
  onApply: (subject: string, body: string) => void;
};

export function TemplateRewriterPanel({
  subject,
  body,
  mergeFields,
  onApply,
}: Props) {
  const [tone, setTone] = useState("neutral");
  const [length, setLength] = useState("medium");
  const [variants, setVariants] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjectVariants, setSubjectVariants] = useState<string[]>([]);
  const [bodyVariants, setBodyVariants] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Extract merge fields from subject and body if not provided
  const detectedMergeFields = useMemo(() => {
    if (mergeFields && mergeFields.length > 0) {
      return mergeFields;
    }
    const subjectTags = extractMergeTags(subject);
    const bodyTags = extractMergeTags(body);
    return Array.from(new Set([...subjectTags, ...bodyTags]));
  }, [subject, body, mergeFields]);

  const run = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/template/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          tone,
          length,
          variants,
          mergeFields: detectedMergeFields,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || json.error || "AI rewrite failed.");
        return;
      }

      setSubjectVariants(json.subject_variants || []);
      setBodyVariants(json.body_variants || []);
      setSelectedIdx(null);
    } catch (e: any) {
      setError(e.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const applyVariant = (idx: number) => {
    const s = subjectVariants[idx] ?? subject;
    const b = bodyVariants[idx] ?? body;
    onApply(s, b);
    setSelectedIdx(idx);
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Smart Template Rewriter</h3>
      </div>

      {error && (
        <p className="text-xs text-red-500 border border-red-500/40 px-2 py-1 rounded">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Tone</label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="playful">Playful</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Length</label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Length" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">
          Number of variants (1–5)
        </label>
        <Input
          type="number"
          min={1}
          max={5}
          value={variants}
          onChange={(e) => setVariants(Number(e.target.value || 1))}
          className="h-8 text-xs"
        />
      </div>

      {detectedMergeFields.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Merge fields detected:</span>{" "}
          {detectedMergeFields.join(", ")}
        </div>
      )}

      <Button
        size="sm"
        className="w-full"
        onClick={run}
        disabled={loading}
      >
        {loading ? "Rewriting..." : "Rewrite with AI"}
      </Button>

      {subjectVariants.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Variants</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {subjectVariants.map((s, idx) => (
              <div
                key={idx}
                className={`border rounded p-2 space-y-2 ${
                  selectedIdx === idx ? "border-primary" : "border-muted"
                }`}
              >
                <div className="text-xs font-semibold">Subject #{idx + 1}</div>
                <div className="text-xs bg-muted rounded px-2 py-1">
                  {s}
                </div>
                <div className="text-xs font-semibold mt-1">Body #{idx + 1}</div>
                <Textarea
                  className="text-xs h-24"
                  value={bodyVariants[idx] || ""}
                  readOnly
                />
                <Button
                  size="xs"
                  className="mt-1 w-full"
                  onClick={() => applyVariant(idx)}
                >
                  Use this variant
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}







