"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectTrigger, SelectContent } from "@/components/ui/select";
import { extractVars } from "@/lib/template-vars";

interface RewriterPanelProps {
  originalText: string;
  onRewrite: (rewritten: string) => void;
}

export function RewriterPanel({ originalText, onRewrite }: RewriterPanelProps) {
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract variables from the original text
  const variables = extractVars(originalText);
  const variablesMap: Record<string, boolean> = {};
  variables.forEach((v) => {
    variablesMap[v.key] = true;
  });

  async function rewrite() {
    if (!originalText.trim()) {
      setError("Please provide text to rewrite");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/rewriter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: originalText,
          tone,
          length,
          variables: variablesMap,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rewrite template");
      }

      const data = await res.json();
      onRewrite(data.rewritten);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rewrite template");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-zinc-900/50 border-zinc-800">
      <h3 className="font-bold text-lg text-white">AI Rewrite</h3>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Tone</label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-white">
              Tone: {tone}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="aggressive">Aggressive Outbound</SelectItem>
              <SelectItem value="soft">Soft / Human</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Length</label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-white">
              Length: {length === "concise" ? "Short & Concise" : length === "medium" ? "Normal" : "Longer & Detailed"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Short & Concise</SelectItem>
              <SelectItem value="medium">Normal</SelectItem>
              <SelectItem value="expanded">Longer & Detailed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {variables.length > 0 && (
          <div className="text-xs text-zinc-500">
            Variables detected: {variables.map((v) => v.key).join(", ")}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
            {error}
          </div>
        )}

        <Button
          onClick={rewrite}
          disabled={loading || !originalText.trim()}
          className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
        >
          {loading ? "Rewriting…" : "Rewrite Template"}
        </Button>
      </div>
    </div>
  );
}

