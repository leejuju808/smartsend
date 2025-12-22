"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Variant = { text: string };

export function TemplateRewriter({
  userId,
  orgId,
  templateId,
  initialText,
  onAccept,
  onSaveVersion,
}: {
  userId: string;
  orgId?: string | null;
  templateId?: string | null;
  initialText: string;
  onAccept: (text: string) => void;
  onSaveVersion?: (label: string, text: string) => Promise<void>;
}) {
  const [text, setText] = React.useState(initialText);
  const [tone, setTone] = React.useState<
    "neutral" | "friendly" | "authoritative" | "concise" | "casual" | "polite"
  >("neutral");
  const [length, setLength] = React.useState<"short" | "medium" | "long">("medium");
  const [purpose, setPurpose] = React.useState<
    "cold_outreach" | "follow_up" | "breakup" | "bump" | "intro"
  >("cold_outreach");
  const [avoidSpammy, setAvoidSpammy] = React.useState(true);
  const [keepMergeTags, setKeepMergeTags] = React.useState(true);
  const [variantCount, setVariantCount] = React.useState(2);
  const [variables, setVariables] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [label, setLabel] = React.useState("");

  const rewrite = async () => {
    setLoading(true);
    setVariants([]);
    const res = await fetch("/api/templates/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        orgId,
        templateId,
        text,
        tone,
        length,
        purpose,
        avoidSpammy,
        variantCount,
        keepMergeTags,
        variables,
      }),
    });
    const j = await res.json();
    setLoading(false);
    if (res.ok) {
      const arr = (j.variants as string[]).map((t) => ({ text: t }));
      setVariants(arr);
    } else {
      alert(j.error || "Rewrite failed");
    }
  };

  const accept = (v: string) => onAccept(v);

  const saveVersion = async (v: string) => {
    if (!onSaveVersion) return;
    const lbl = label || "Variant";
    await onSaveVersion(lbl, v);
    setLabel("");
  };

  const [varsEditor, setVarsEditor] = React.useState("");
  const parseVars = () => {
    const obj: Record<string, string> = {};
    for (const part of varsEditor.split(",").map((s) => s.trim()).filter(Boolean)) {
      const i = part.indexOf("=");
      if (i > -1) obj[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    setVariables(obj);
  };

  return (
    <div className="grid h-full grid-cols-12 gap-3">
      <div className="col-span-4 rounded-2xl border p-3 space-y-3">
        <div className="text-sm font-medium">Smart Template Rewriter</div>

        <div className="space-y-1">
          <Label className="text-xs">Tone</Label>
          <Select value={tone} onValueChange={(v: any) => setTone(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="authoritative">Authoritative</SelectItem>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="polite">Polite</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Length</Label>
          <Select value={length} onValueChange={(v: any) => setLength(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Purpose</Label>
          <Select value={purpose} onValueChange={(v: any) => setPurpose(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cold_outreach">Cold outreach</SelectItem>
              <SelectItem value="follow_up">Follow up</SelectItem>
              <SelectItem value="bump">Bump</SelectItem>
              <SelectItem value="breakup">Breakup</SelectItem>
              <SelectItem value="intro">Intro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">Avoid spammy phrasing</div>
          <Switch checked={avoidSpammy} onCheckedChange={setAvoidSpammy} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Preserve {{ }} tags</div>
          <Switch checked={keepMergeTags} onCheckedChange={setKeepMergeTags} />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Variants</Label>
          <Select value={String(variantCount)} onValueChange={(v) => setVariantCount(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Variables (key=value, comma separated)</Label>
          <Input
            placeholder="first_name=Ana, company=Aurev, pain_point=slow follow-ups"
            value={varsEditor}
            onChange={(e) => setVarsEditor(e.target.value)}
            onBlur={parseVars}
          />
        </div>

        <Button className="w-full" onClick={rewrite} disabled={loading}>
          {loading ? "Rewriting..." : "Rewrite"}
        </Button>
      </div>

      <div className="col-span-8 space-y-3">
        <div className="rounded-2xl border p-3">
          <div className="mb-2 text-sm font-medium">Source Template</div>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <div className="rounded-2xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Variants</div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Label (e.g., A, Short-Friendy)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 w-48"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {variants.map((v, i) => (
              <div key={i} className="rounded-xl border p-3">
                <div className="mb-2 text-xs text-muted-foreground">Variant {i + 1}</div>
                <pre className="whitespace-pre-wrap text-sm">{v.text}</pre>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => accept(v.text)}>
                    Use this
                  </Button>
                  {onSaveVersion && (
                    <Button size="sm" variant="outline" onClick={() => saveVersion(v.text)}>
                      Save as Version
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!variants.length && (
              <div className="text-sm text-muted-foreground">Run “Rewrite” to generate A/B variants.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


