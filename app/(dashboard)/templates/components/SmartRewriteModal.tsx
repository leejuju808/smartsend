"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export function SmartRewriteModal() {
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [tone, setTone] = useState("neutral");
  const [focus, setFocus] = useState("clarity");
  const [loading, setLoading] = useState(false);

  async function rewrite() {
    setLoading(true);
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone, focus })
      });
      const data = await res.json();
      setOutput(data.rewritten || "");
    } catch (error) {
      console.error("Rewrite error:", error);
      setOutput("Error rewriting template. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Select value={tone} onValueChange={setTone}>
        <SelectTrigger>Tone: {tone}</SelectTrigger>
        <SelectContent>
          <SelectItem value="neutral">Neutral</SelectItem>
          <SelectItem value="friendly">Friendly</SelectItem>
          <SelectItem value="professional">Professional</SelectItem>
          <SelectItem value="bold">Bold</SelectItem>
          <SelectItem value="concise">Concise</SelectItem>
          <SelectItem value="warm">Warm</SelectItem>
          <SelectItem value="curious">Curious</SelectItem>
        </SelectContent>
      </Select>

      <Select value={focus} onValueChange={setFocus}>
        <SelectTrigger>Focus: {focus}</SelectTrigger>
        <SelectContent>
          <SelectItem value="clarity">Clarity</SelectItem>
          <SelectItem value="persuasion">Persuasion</SelectItem>
          <SelectItem value="brevity">Brevity</SelectItem>
          <SelectItem value="personalization">Personalization</SelectItem>
          <SelectItem value="conversion">Conversion</SelectItem>
        </SelectContent>
      </Select>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your cold email template here..."
        rows={8}
      />

      <Button onClick={rewrite} disabled={loading || !text.trim()}>
        {loading ? "Rewriting..." : "Rewrite"}
      </Button>

      {output && (
        <div className="mt-4 border rounded-lg p-3 bg-muted">
          <h3 className="text-sm font-semibold mb-2">Rewritten Template</h3>
          <pre className="whitespace-pre-wrap text-sm">{output}</pre>
        </div>
      )}
    </div>
  );
}

