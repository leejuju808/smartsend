"use client";

import { useState } from "react";

type Mode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "more_direct"
  | "variant";

export function useTemplateRewriter() {
  const [loading, setLoading] = useState(false);
  const [lastMode, setLastMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rewrite = async (args: {
    subject?: string;
    body?: string;
    mode: Mode;
    context?: string;
  }) => {
    setLoading(true);
    setError(null);
    setLastMode(args.mode);
    try {
      const res = await fetch("/api/ai/rewrite-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to rewrite template.");
        return null;
      }
      return {
        subject: json.subject as string | null,
        body: json.body as string,
      };
    } catch (e) {
      console.error(e);
      setError("Unexpected error while rewriting.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { rewrite, loading, error, lastMode };
}







