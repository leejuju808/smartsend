"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface Lead {
  first_name?: string;
  company?: string;
  industry?: string;
  email?: string;
  linkedin_url?: string;
}

interface User {
  full_name?: string;
  email?: string;
  company?: string;
}

interface RewriterV2PanelProps {
  originalText: string;
  lead?: Lead;
  user?: User;
  onVariants: (variants: string[]) => void;
}

export function RewriterV2Panel({
  originalText,
  lead,
  user,
  onVariants,
}: RewriterV2PanelProps) {
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("concise");
  const [mode, setMode] = useState("more_human");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!originalText.trim()) {
      setError("Please provide text to rewrite");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/rewriter/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: originalText,
          lead: lead || {},
          user: user || {},
          tone,
          length,
          mode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rewrite template");
      }

      const data = await res.json();
      if (data.variants && Array.isArray(data.variants)) {
        onVariants(data.variants);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rewrite template");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-zinc-900/50 border-zinc-800">
      <h3 className="font-bold text-lg text-white">AI Rewrite v2</h3>

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
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="soft">Soft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Length</label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-white">
              Length: {length === "concise" ? "Short" : length === "medium" ? "Medium" : "Long"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="expanded">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Mode</label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-white">
              Mode: {mode === "more_human" ? "More Human" : mode === "more_conversational" ? "More Conversational" : mode === "more_confident" ? "More Confident" : "Less Aggressive"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="more_human">More Human</SelectItem>
              <SelectItem value="more_conversational">More Conversational</SelectItem>
              <SelectItem value="more_confident">More Confident</SelectItem>
              <SelectItem value="less_aggressive">Less Aggressive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {lead && (
          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-800">
            <p className="font-medium mb-1">Lead context:</p>
            {lead.first_name && <p>Name: {lead.first_name}</p>}
            {lead.company && <p>Company: {lead.company}</p>}
            {lead.industry && <p>Industry: {lead.industry}</p>}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
            {error}
          </div>
        )}

        <Button
          onClick={run}
          disabled={loading || !originalText.trim()}
          className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
        >
          {loading ? "Generating…" : "Rewrite with AI"}
        </Button>
      </div>
    </div>
  );
}

