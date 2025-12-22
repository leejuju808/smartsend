"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2 } from "lucide-react";

type Props = {
  initialSubject: string;
  initialBody: string;
  onUseVariant: (v: { subject: string; body: string }) => void;
};

export default function TemplateRewriteDialog({ initialSubject, initialBody, onUseVariant }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [tone, setTone] = useState("neutral, professional");
  const [length, setLength] = useState<"short"|"medium"|"long">("short");
  const [persona, setPersona] = useState("busy small-business owner");
  const [ctaStyle, setCtaStyle] = useState<"soft"|"direct"|"question">("question");
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<{subject:string; body:string}[] | null>(null);

  const run = async () => {
    setLoading(true);
    setVariants(null);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, options: { tone, length, persona, ctaStyle } })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setVariants(j.variants || []);
    } catch (e:any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const VariantCard = ({ v, i }: { v:{subject:string; body:string}, i:number }) => (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="text-xs opacity-60">Variant {i+1}</div>
      <div className="font-medium">{v.subject || "(no subject)"}</div>
      <div className="prose prose-sm dark:prose-invert max-h-[30vh] overflow-auto" dangerouslySetInnerHTML={{ __html: v.body.replace(/\n/g,"<br/>") }} />
      <div className="flex justify-end">
        <Button onClick={() => { onUseVariant(v); setOpen(false); }}>Use this</Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Wand2 className="h-4 w-4 mr-2" /> Rewrite with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Smart Template Rewriter</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Subject</Label>
              <Textarea value={subject} onChange={e=>setSubject(e.target.value)} className="h-20" />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <Textarea value={body} onChange={e=>setBody(e.target.value)} className="h-40" />
              <p className="text-xs opacity-60">Placeholders like <code>{{"{{first_name}}"}}</code> will be preserved.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue placeholder="Tone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral, professional">Neutral</SelectItem>
                  <SelectItem value="warm, helpful">Warm</SelectItem>
                  <SelectItem value="concise, direct">Concise</SelectItem>
                  <SelectItem value="friendly, conversational">Friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Length</Label>
              <Select value={length} onValueChange={(v)=>setLength(v as any)}>
                <SelectTrigger><SelectValue placeholder="Length" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CTA Style</Label>
              <Select value={ctaStyle} onValueChange={(v)=>setCtaStyle(v as any)}>
                <SelectTrigger><SelectValue placeholder="CTA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Persona</Label>
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger><SelectValue placeholder="Persona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="busy small-business owner">SMB Owner</SelectItem>
                  <SelectItem value="IT manager">IT Manager</SelectItem>
                  <SelectItem value="marketing director">Marketing Director</SelectItem>
                  <SelectItem value="founder">Founder</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={run} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate 3 variants
            </Button>
          </div>

          <Tabs defaultValue="variants">
            <TabsList>
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="original">Original</TabsTrigger>
            </TabsList>
            <TabsContent value="variants">
              {loading ? (
                <div className="grid md:grid-cols-3 gap-3">
                  {[0,1,2].map(i=>(
                    <div key={i} className="rounded-xl border p-3 space-y-2 animate-pulse">
                      <div className="h-4 w-24 bg-muted rounded" />
                      <div className="h-4 w-3/4 bg-muted rounded" />
                      <div className="h-24 w-full bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : !variants ? (
                <div className="text-sm opacity-70">Click "Generate" to see suggestions.</div>
              ) : (
                <div className="grid md:grid-cols-3 gap-3">
                  {variants.map((v,i)=><VariantCard key={i} v={v} i={i} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="original">
              <div className="rounded-xl border p-3 space-y-2">
                <div className="font-medium">{subject || "(no subject)"}</div>
                <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: body.replace(/\n/g,"<br/>") }} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}