"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface SmartRewriteButtonProps {
  subject: string;
  body: string;
  onResults: (variants: Array<{ subject: string; body: string }>) => void;
  subjectOnly?: boolean;
}

export function SmartRewriteButton({
  subject,
  body,
  onResults,
  subjectOnly = false,
}: SmartRewriteButtonProps) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState("neutral");
  const [length, setLength] = useState("same");
  const [variants, setVariants] = useState(subjectOnly ? 3 : 3);
  const [spamSafe, setSpamSafe] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleRewrite() {
    setLoading(true);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectOnly ? subject : subject,
          text: subjectOnly ? "" : body,
          tone,
          length,
          variants,
          keep_placeholders: true,
          spam_safe: spamSafe,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to rewrite template");
      }

      const data = await res.json();
      
      // If placeholder safety check failed but variants are returned, warn but proceed
      if (data.missing_placeholders && data.missing_placeholders.length > 0) {
        const confirmed = confirm(
          `Warning: Some placeholders may be missing: ${data.missing_placeholders.join(", ")}\n\nContinue anyway?`
        );
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }

      onResults(data.variants);
      setOpen(false);
    } catch (error) {
      console.error("Rewrite error:", error);
      alert(error instanceof Error ? error.message : "Failed to rewrite template");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {subjectOnly ? "✨ Rewrite" : "Rewrite with AI"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="space-y-4 max-w-md">
          <DialogHeader>
            <DialogTitle>
              {subjectOnly ? "Rewrite Subject Line" : "Rewrite Template with AI"}
            </DialogTitle>
            <DialogDescription>
              {subjectOnly
                ? "Generate alternative subject lines."
                : "Adjust tone, length, and generate multiple variants."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger>
                  <SelectValue placeholder="Select length" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shorter">Shorter</SelectItem>
                  <SelectItem value="same">Same</SelectItem>
                  <SelectItem value="longer">Longer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!subjectOnly && (
              <div>
                <Label>Variants</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={variants}
                  onChange={(e) => setVariants(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                />
              </div>
            )}

            {!subjectOnly && (
              <div className="flex items-center gap-2 md:col-span-2">
                <Checkbox
                  checked={spamSafe}
                  onCheckedChange={(v) => setSpamSafe(Boolean(v))}
                />
                <Label className="text-sm cursor-pointer">
                  Prefer deliverability-safe wording
                </Label>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleRewrite}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Rewrites"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

