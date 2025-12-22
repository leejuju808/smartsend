"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type RewriteMode =
  | "professional"
  | "shorter"
  | "friendly"
  | "aggressive"
  | "personalized"
  | "deliverability";

const MODE_OPTIONS: Array<{ value: RewriteMode; label: string }> = [
  { value: "professional", label: "More Professional" },
  { value: "shorter", label: "Shorter" },
  { value: "friendly", label: "Friendlier" },
  { value: "aggressive", label: "More Aggressive" },
  { value: "personalized", label: "Add Personalization" },
  { value: "deliverability", label: "Improve Deliverability" },
];

interface AIRewriteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText: string;
  onRewrite: (rewrittenText: string) => void;
}

export function AIRewriteModal({
  open,
  onOpenChange,
  selectedText,
  onRewrite,
}: AIRewriteModalProps) {
  const [mode, setMode] = useState<RewriteMode>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRewrite = async () => {
    if (!selectedText.trim()) {
      setError("No text selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/editor/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText, mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to rewrite");
      }

      onRewrite(data.rewritten);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to rewrite text");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rewrite with AI</DialogTitle>
          <DialogDescription>
            Select a style to rewrite the selected text
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected Text Preview */}
          <div>
            <Label className="text-sm font-medium">Selected Text</Label>
            <div className="mt-2 p-3 bg-muted/30 rounded-md text-sm max-h-32 overflow-y-auto">
              {selectedText || "(No text selected)"}
            </div>
          </div>

          {/* Style Options */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Style</Label>
            <div className="space-y-2">
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="rewrite-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={(e) => setMode(e.target.value as RewriteMode)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleRewrite} disabled={loading || !selectedText.trim()}>
            {loading ? "Rewriting..." : "Rewrite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




























































