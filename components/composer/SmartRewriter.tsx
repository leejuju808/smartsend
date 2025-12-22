"use client";

import * as React from "react";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Props = {
  initialBody?: string;
  initialSubject?: string;
  onApplyBody?: (v: string) => void;
  onApplySubject?: (v: string) => void;
};

const TONES = [
  { v: "neutral", label: "Neutral" },
  { v: "warm", label: "Warm" },
  { v: "direct", label: "Direct" },
  { v: "consultative", label: "Consultative" },
  { v: "technical", label: "Technical" },
  { v: "upbeat", label: "Upbeat" },
];

export function SmartRewriter({ initialBody = "", initialSubject = "", onApplyBody, onApplySubject }: Props) {
  const [tab, setTab] = useState<"body"|"subject">("body");
  const [text, setText] = useState(initialBody || "");
  const [subject, setSubject] = useState(initialSubject || "");
  const [tone, setTone] = useState("neutral");
  const [length, setLength] = useState<"shorter"|"same"|"longer">("same");
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);

  async function rewrite(mode: "body"|"subject") {
    const payload = {
      text: mode === "body" ? text : subject,
      mode,
      tone,
      length,
      variantCount: 3,
    };
    setBusy(true);
    setVariants([]);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Rewrite failed");
      setVariants(json.variants || []);
    } catch (e) {
      // noop UI toast optional
    } finally {
      setBusy(false);
    }
  }

  async function brainstormSubjects() {
    setBusy(true);
    setIdeas([]);
    try {
      const res = await fetch("/api/ai/subject-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "SMB cold outreach", base: subject, variantCount: 5 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ideas failed");
      setIdeas(json.ideas || []);
    } catch (e) {
      // noop
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Smart Template Rewriter</div>
        <div className="flex items-center gap-2">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tone" /></SelectTrigger>
            <SelectContent>
              {TONES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={length} onValueChange={(v)=>setLength(v as any)}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Length" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="shorter">Shorter</SelectItem>
              <SelectItem value="same">Same</SelectItem>
              <SelectItem value="longer">Longer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue={tab} value={tab} onValueChange={(v)=>setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="subject">Subject</TabsTrigger>
        </TabsList>
        <TabsContent value="body" className="space-y-3">
          <Textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder="Paste your body (preserve {{merge_tags}})" rows={8} />
          <div className="flex gap-2">
            <Button onClick={()=>rewrite("body")} disabled={busy || !text}>Rewrite Body</Button>
            <Button variant="secondary" onClick={()=>setLength("shorter")} disabled={busy}>Shorter</Button>
            <Button variant="secondary" onClick={()=>setLength("same")} disabled={busy}>Keep Length</Button>
            <Button variant="secondary" onClick={()=>setLength("longer")} disabled={busy}>Expand</Button>
          </div>
          {!!variants.length && (
            <div className="grid md:grid-cols-3 gap-3">
              {variants.map((v, i) => (
                <VariantCard
                  key={i}
                  text={v}
                  onUse={() => onApplyBody?.(v)}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="subject" className="space-y-3">
          <Input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Subject line (<= 45 chars ideal)" />
          <div className="flex gap-2">
            <Button onClick={()=>rewrite("subject")} disabled={busy || !subject}>Rewrite Subject</Button>
            <Button variant="secondary" onClick={brainstormSubjects} disabled={busy}>Brainstorm 5</Button>
          </div>
          {!!variants.length && tab === "subject" && (
            <div className="grid md:grid-cols-3 gap-3">
              {variants.map((v, i) => (
                <VariantCard key={`s${i}`} text={v} onUse={() => onApplySubject?.(v)} />
              ))}
            </div>
          )}
          {!!ideas.length && (
            <div className="grid md:grid-cols-5 gap-2">
              {ideas.map((s, i) => (
                <button
                  key={i}
                  className={cn("rounded-lg border p-2 text-left text-sm hover:bg-muted/50")}
                  onClick={()=>onApplySubject?.(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VariantCard({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">Variant</div>
      <div className="text-sm whitespace-pre-wrap">{text}</div>
      <div className="mt-auto">
        <Button size="sm" onClick={onUse}>Use this</Button>
      </div>
    </div>
  );
}


