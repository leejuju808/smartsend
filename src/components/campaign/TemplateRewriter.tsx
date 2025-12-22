"use client";
import * as React from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/toast/ToastProvider";

const fetcher = (u: string, init?: any) => fetch(u, init).then(r => r.json());

export function TemplateRewriter({ campaignId, baseSubject, baseBody }: { campaignId: string; baseSubject: string; baseBody: string; }) {
  const { addToast } = useToast();
  const [subject, setSubject] = React.useState(baseSubject);
  const [body, setBody] = React.useState(baseBody);
  const [tone, setTone] = React.useState<"friendly"|"professional"|"casual"|"persuasive"|"concise">("friendly");
  const [objective, setObjective] = React.useState("book a 15-min call");
  const [loading, setLoading] = React.useState(false);
  const [ideas, setIdeas] = React.useState<any[]>([]);

  const { mutate } = useSWR(`/api/campaigns/${campaignId}/template-variants`, fetcher);

  async function generate() {
    setLoading(true);
    setIdeas([]);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smartRewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, tone, objective, variants: 3, constraints: { max_words: 160, spam_minimize: true } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "rewrite_failed");
      setIdeas(data.variants || []);
    } catch (e: any) {
      addToast({ title: "Rewrite failed", description: e.message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function saveVariant(v: any) {
    const r = await fetch(`/api/campaigns/${campaignId}/template-variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        subject_template: v.subject,
        body_template: v.body_html,
        weight: 50,
        is_active: true
      })
    });
    const j = await r.json();
    if (!r.ok) {
      addToast({ title: "Save failed", description: j.error, variant: "error" });
    } else {
      addToast({ title: "Variant saved", description: v.name, variant: "success" });
      mutate();
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="grid gap-2">
        <Label>Base Subject</Label>
        <Input value={subject} onChange={(e)=>setSubject(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Base Body (HTML or plain)</Label>
        <Textarea rows={8} value={body} onChange={(e)=>setBody(e.target.value)} />
      </div>
      <div className="flex gap-2 items-center">
        <Input className="max-w-xs" value={objective} onChange={(e)=>setObjective(e.target.value)} placeholder="Objective (e.g., book a 15-min call)" />
        <select className="border rounded px-2 py-2 text-sm" value={tone} onChange={(e)=>setTone(e.target.value as any)}>
          <option value="friendly">Friendly</option>
          <option value="professional">Professional</option>
          <option value="casual">Casual</option>
          <option value="persuasive">Persuasive</option>
          <option value="concise">Concise</option>
        </select>
        <Button onClick={generate} disabled={loading}>{loading ? "Generating…" : "Generate variants"}</Button>
      </div>

      {!!ideas.length && (
        <div className="grid gap-3">
          {ideas.map((v, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{v.name}</div>
                <div className="text-xs text-gray-500">Spam risk: {v.spam_risk?.score ?? 0}/100</div>
              </div>
              <div className="text-sm"><span className="font-medium">Subject:</span> {v.subject}</div>
              <div className="text-sm border rounded p-2 bg-white" dangerouslySetInnerHTML={{ __html: v.body_html }} />
              <div className="text-xs text-gray-500">{v.rationale}</div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(v.subject)}>Copy subject</Button>
                <Button size="sm" onClick={()=>saveVariant(v)}>Save as variant</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


