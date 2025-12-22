"use client";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateMergeTagsPreserved, checkDeliverability } from "@/lib/merge-tags";

type Variant = { label: string; subject: string; body: string; score?: number };

export default function RewriterSheet({
  initialSubject,
  initialBody,
  onApply,
}: {
  initialSubject: string;
  initialBody: string;
  onApply: (v: Variant) => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [tone, setTone] = useState<"neutral"|"warm"|"punchy">("neutral");
  const [length, setLength] = useState<"short"|"medium"|"long">("medium");
  const [audience, setAudience] = useState("small business owner");
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, body, tone, length, audience,
          constraints: ["preserve all {{merge_tags}}", "avoid spam trigger words"],
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate variants");
      }
      
      const data = await res.json();
      setVariants(data.variants || []);
    } catch (e: any) {
      alert(e.message || "Failed to generate variants");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">Rewrite with AI</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Smart Template Rewriter</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4 px-6">
          <div className="grid gap-2">
            <Label>Subject</Label>
            <Textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tone</Label>
              <RadioGroup value={tone} onValueChange={(v:any)=>setTone(v)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="neutral" id="t1"/>
                  <Label htmlFor="t1" className="font-normal">Neutral</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="warm" id="t2"/>
                  <Label htmlFor="t2" className="font-normal">Warm</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="punchy" id="t3"/>
                  <Label htmlFor="t3" className="font-normal">Punchy</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label>Length</Label>
              <Select value={length} onValueChange={(v:any)=>setLength(v)}>
                <SelectTrigger><SelectValue placeholder="medium" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Audience</Label>
            <Textarea value={audience} onChange={(e)=>setAudience(e.target.value)} rows={1} />
          </div>

          <Button onClick={run} disabled={loading}>
            {loading ? "Rewriting..." : "Generate Variants"}
          </Button>

          {variants.length > 0 && (
            <div className="mt-4 space-y-3">
              {variants.map((v, i) => (
                <div key={i} className="border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {v.label} {v.score !== undefined ? `• ${Math.round(v.score*100)}%` : ""}
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => {
                        // Validate merge tags before applying
                        const tagValidation = validateMergeTagsPreserved(body, v.body);
                        if (!tagValidation.valid) {
                          alert(`Missing merge tags: ${tagValidation.missing.join(", ")}. Variant not applied.`);
                          return;
                        }
                        
                        // Check deliverability
                        const deliverabilityCheck = checkDeliverability(v.subject, v.body);
                        if (!deliverabilityCheck.valid) {
                          const proceed = confirm(
                            `Deliverability warnings:\n${deliverabilityCheck.issues.join("\n")}\n\nApply anyway?`
                          );
                          if (!proceed) return;
                        }
                        
                        onApply(v);
                        setOpen(false);
                      }}
                    >
                      Use this
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Subject: {v.subject}</div>
                  <pre className="whitespace-pre-wrap text-sm mt-2">{v.body}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter />
      </SheetContent>
    </Sheet>
  );
}

