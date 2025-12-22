"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SequenceGenerator({
  campaignId,
  onSaved,
}: {
  campaignId: string;
  onSaved?: () => void;
}) {
  const [product, setProduct] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [valueProp, setValueProp] = React.useState("");
  const [pains, setPains] = React.useState("");
  const [tone, setTone] = React.useState("neutral");
  const [length, setLength] = React.useState("short");
  const [includePS, setIncludePS] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [steps, setSteps] = React.useState<any[]>([]);

  const run = async () => {
    setLoading(true);
    setSteps([]);
    const res = await fetch("/api/sequences/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product, audience, valueProp,
        painPoints: pains.split(",").map(s => s.trim()).filter(Boolean),
        tone, length, includePS, keepMergeTags: true
      })
    });
    const j = await res.json();
    setLoading(false);
    if (!res.ok) { alert(j.error || "Generation failed"); return; }
    setSteps(j.steps || []);
  };

  const save = async () => {
    const res = await fetch("/api/campaigns/steps/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, steps })
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || "Save failed"); return; }
    onSaved?.();
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-4 rounded-2xl border p-3 space-y-2">
        <div className="text-sm font-medium">Generate 5-Touch Sequence</div>
        <div className="space-y-1">
          <Label className="text-xs">Product / Offer</Label>
          <Input value={product} onChange={(e)=>setProduct(e.target.value)} placeholder="SmartSend — cold email copilot for SMBs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Audience</Label>
          <Input value={audience} onChange={(e)=>setAudience(e.target.value)} placeholder="Local service businesses (roofing, HVAC) owners" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Value Proposition</Label>
          <Textarea value={valueProp} onChange={(e)=>setValueProp(e.target.value)} placeholder="Book 25–40% more appointments via fast follow-ups + reply detection. Case study: +18% in 21 days." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pain Points (comma separated)</Label>
          <Input value={pains} onChange={(e)=>setPains(e.target.value)} placeholder="slow replies, missed leads, manual follow-ups" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Tone</Label>
            <Select value={tone} onValueChange={setTone as any}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div>
            <Label className="text-xs">Length</Label>
            <Select value={length} onValueChange={setLength as any}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includePS} onChange={(e)=>setIncludePS(e.target.checked)} />
          Include P.S. if helpful
        </label>
        <Button className="w-full" onClick={run} disabled={loading || !product || !audience || !valueProp}>
          {loading ? "Generating…" : "Generate"}
        </Button>
        {steps.length > 0 && (
          <Button className="w-full" variant="secondary" onClick={save}>Save to Campaign</Button>
        )}
      </div>

      <div className="col-span-8 rounded-2xl border p-3 space-y-3">
        <div className="text-sm font-medium">Preview (editable before save)</div>
        {steps.length === 0 ? (
          <div className="text-sm text-muted-foreground">Run “Generate” to see the 5 steps.</div>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium">Step {i+1}: {s.label || ["Intro","Follow-up 1","Follow-up 2","Follow-up 3","Breakup"][i]}</div>
                  <div className="text-xs text-muted-foreground">Delay: <input className="w-14 border rounded px-1 py-0.5 text-right" type="number" min={i===0?0:1} step={1} value={s.delay_hours ?? 0} onChange={(e)=>setSteps(prev => prev.map((p,pi)=>pi===i?{...p,delay_hours:Number(e.target.value)}:p))}/> h</div>
                </div>
                <input
                  className="w-full rounded border px-2 py-1 text-sm mb-2"
                  value={s.subject}
                  onChange={(e)=>setSteps(prev => prev.map((p,pi)=>pi===i?{...p,subject:e.target.value}:p))}
                  placeholder="Subject"
                />
                <Textarea
                  rows={6}
                  value={s.body}
                  onChange={(e)=>setSteps(prev => prev.map((p,pi)=>pi===i?{...p,body:e.target.value}:p))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


