"use client";

import { useState } from "react";

export function useRewriter() {
  const [loading, setLoading] = useState(false);

  async function rewrite(text: string, mode: string): Promise<string> {
    if (!text.trim()) return "";
    
    setLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/ai-rewriter`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, mode }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to rewrite" }));
        throw new Error(error.error || "Failed to rewrite");
      }

      const j = await res.json();
      return j.rewritten || "";
    } catch (error: any) {
      console.error("Error rewriting text:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return { rewrite, loading };
}
