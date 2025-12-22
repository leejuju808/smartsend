"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";

export default function SmartRewriter({
  defaultValue = "",
  onRewrite,
}: {
  defaultValue?: string;
  onRewrite: (text: string) => void;
}) {
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(defaultValue);

  async function handleRewrite() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone }),
      });
      const data = await res.json();
      setLoading(false);
      if (data.rewrite) {
        setText(data.rewrite);
        onRewrite(data.rewrite);
      }
    } catch (error) {
      console.error("Rewrite failed:", error);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4 shadow-sm bg-white">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Smart Template Rewriter ⚡</h3>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="text-sm border rounded-md px-2 py-1"
        >
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="bold">Bold</option>
          <option value="concise">Concise</option>
          <option value="personalized">Personalized</option>
        </select>
      </div>
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-sm"
      />
      <Button
        onClick={handleRewrite}
        disabled={loading}
        className="w-full flex items-center justify-center"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rewriting...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" /> Rewrite Template
          </>
        )}
      </Button>
    </div>
  );
}
