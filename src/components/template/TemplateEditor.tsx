"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const tones = ["Friendly", "Professional", "Punchy", "Casual", "Authoritative"];
const lengths = [
  "Short (60-90w)",
  "Medium (120-150w)",
  "Long (180-220w)",
];
const goals = [
  "Get a quick reply",
  "Book a 15-min call",
  "Share case study",
  "Confirm best contact",
];

export default function TemplateEditor({
  initial,
}: {
  initial?: string;
}) {
  const [draft, setDraft] = useState(
    initial ||
      "Hi {{first_name}},\n\nWe help {{company}} with {{pain_point}}..."
  );
  const [tone, setTone] = useState("Friendly");
  const [length, setLength] = useState("Short (60-90w)");
  const [goal, setGoal] = useState("Get a quick reply");
  const [variants, setVariants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const rewrite = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          tone,
          length,
          goal,
          variant_count: 3,
          reading_grade: 6,
        }),
      });
      const data = await r.json();
      if (data?.variants) {
        setVariants(data.variants);
      } else if (data?.error) {
        console.error("Rewrite error:", data.error);
      }
    } catch (error) {
      console.error("Failed to rewrite:", error);
    } finally {
      setLoading(false);
    }
  };

  const adopt = (v: string) => setDraft(v);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                {tones.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={length} onValueChange={setLength}>
              <SelectTrigger>
                <SelectValue placeholder="Length" />
              </SelectTrigger>
              <SelectContent>
                {lengths.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger>
                <SelectValue placeholder="Goal" />
              </SelectTrigger>
              <SelectContent>
                {goals.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="font-mono"
          />
          <div className="flex gap-2">
            <Button onClick={rewrite} disabled={loading}>
              {loading ? "Rewriting…" : "AI Rewrite (3 variants)"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Variables supported:{" "}
            <code className="bg-muted px-1 rounded">{`{{first_name}}`}</code>,{" "}
            <code className="bg-muted px-1 rounded">{`{{company}}`}</code>,{" "}
            <code className="bg-muted px-1 rounded">{`{{role}}`}</code>,{" "}
            <code className="bg-muted px-1 rounded">{`{{pain_point}}`}</code>,{" "}
            <code className="bg-muted px-1 rounded">{`{{value_prop}}`}</code>.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {variants.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                No variants yet. Click "AI Rewrite" to generate variants.
              </p>
            </CardContent>
          </Card>
        ) : (
          variants.map((v, i) => (
            <Card key={i} className="rounded-2xl border">
              <CardContent className="p-4 space-y-3">
                <div className="text-sm text-muted-foreground">
                  Variant {i + 1}
                </div>
                <pre className="whitespace-pre-wrap text-sm">{v}</pre>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => adopt(v)}>
                    Use this
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
