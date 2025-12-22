"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/toast/ToastProvider";

type Controls = {
  tone: "neutral" | "friendly" | "professional" | "direct" | "persuasive";
  length: "short" | "medium" | "long";
  goal: "book_call" | "get_reply" | "share_case_study" | "demo";
  readingLevel?: "grade6" | "grade8" | "grade10";
  forbidSpammy?: boolean;
  variants?: number;
};

export function AiRewritePanel({
  initialSubject,
  initialBody,
  mergeFields = ["{first_name}", "{company}"],
  onPickVariant
}: {
  initialSubject: string;
  initialBody: string;
  mergeFields?: string[];
  onPickVariant: (v: { subject: string; body: string }) => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [controls, setControls] = useState<Controls>({
    tone: "friendly",
    length: "short",
    goal: "get_reply",
    readingLevel: "grade8",
    forbidSpammy: true,
    variants: 2
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{subject: string; body: string; lint?: string[]}>>([]);
  const { addToast } = useToast();

  const generate = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ subject, body, controls, mergeFields })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Rewrite failed");
      
      if (data.missingMergeFields?.length) {
        addToast({
          title: "Warning",
          description: `Missing merge fields in draft: ${data.missingMergeFields.join(", ")}`,
          variant: "info"
        });
      }
      
      if (data.preFlags?.length) {
        addToast({
          title: "Heads up",
          description: data.preFlags.join(" • "),
          variant: "info"
        });
      }
      
      setResults(data.variants ?? []);
    } catch (e: any) {
      addToast({
        title: "Error",
        description: e.message,
        variant: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async (v: {subject: string; body: string}) => {
    const name = prompt("Save as template — name:");
    if (!name) return;
    
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ name, subject: v.subject, body: v.body })
      });
      const data = await res.json();
      
      if (res.ok) {
        addToast({
          title: "Success",
          description: "Template saved",
          variant: "success"
        });
      } else {
        addToast({
          title: "Error",
          description: data?.error || "Save failed",
          variant: "error"
        });
      }
    } catch (e: any) {
      addToast({
        title: "Error",
        description: e.message || "Save failed",
        variant: "error"
      });
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Controls */}
      <Card className="col-span-4">
        <CardContent className="space-y-3 p-4">
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={8} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tone</Label>
              <Select value={controls.tone} onValueChange={(v: any) => setControls(c => ({...c, tone: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="persuasive">Persuasive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Length</Label>
              <Select value={controls.length} onValueChange={(v: any) => setControls(c => ({...c, length: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Goal</Label>
              <Select value={controls.goal} onValueChange={(v: any) => setControls(c => ({...c, goal: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="get_reply">Get Reply</SelectItem>
                  <SelectItem value="book_call">Book Call</SelectItem>
                  <SelectItem value="share_case_study">Share Case Study</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reading level</Label>
              <Select value={controls.readingLevel || "grade8"} onValueChange={(v: any) => setControls(c => ({...c, readingLevel: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grade6">Grade 6</SelectItem>
                  <SelectItem value="grade8">Grade 8</SelectItem>
                  <SelectItem value="grade10">Grade 10</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={!!controls.forbidSpammy} 
                onChange={e => setControls(c => ({...c, forbidSpammy: e.target.checked}))} 
              />
              Forbid spammy language
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Variants</Label>
              <Input 
                type="number" 
                className="w-16" 
                min={1} 
                max={3}
                value={controls.variants ?? 2}
                onChange={e => setControls(c => ({...c, variants: Number(e.target.value)}))}
              />
            </div>
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? "Rewriting…" : "Rewrite with AI"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="col-span-8 space-y-3">
        {results.map((v, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs opacity-60">
                Variant {i+1} {v.lint?.length ? `• Lint: ${v.lint.join(" | ")}` : ""}
              </div>
              <div className="font-medium">{v.subject}</div>
              <pre className="whitespace-pre-wrap text-sm">{v.body}</pre>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onPickVariant(v)}>Use This</Button>
                <Button size="sm" variant="secondary" onClick={() => saveTemplate(v)}>Save as Template</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {results.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm opacity-70">
              No variants yet — press "Rewrite with AI".
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

