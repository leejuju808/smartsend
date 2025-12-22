"use client";

import { useState } from "react";

export type RewriteTone = "casual" | "neutral" | "formal";
export type RewriteGoal =
  | "shorten"
  | "expand"
  | "punchier"
  | "softer"
  | "improve";

export function useTemplateRewrite() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rewrite = async (opts: {
    text: string;
    tone?: RewriteTone;
    goal?: RewriteGoal;
    numVariants?: number;
  }): Promise<string[]> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/template-rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: opts.text,
          tone: opts.tone || "neutral",
          goal: opts.goal || "improve",
          numVariants: opts.numVariants || 1,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "rewrite_failed");
        return [];
      }
      return json.variants || [];
    } catch (e: any) {
      console.error(e);
      setError("network_error");
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { rewrite, loading, error };
}







