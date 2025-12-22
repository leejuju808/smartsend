"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { renderTemplate } from "@/lib/merge/renderTemplate";
import { findUnknownVars, lintTemplate } from "@/lib/merge/validateTemplate";

type Props = {
  selectedLeadIds: string[]; // pass from your DataTable selection
};

export default function NewCampaignButton({ selectedLeadIds }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [dailyLimit, setDailyLimit] = useState<number>(200);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // AI rewrite state
  const [intent, setIntent] = useState<"shorter"|"friendlier"|"curious"|"punchier"|"formal"|"rewrite">("shorter");
  const [length, setLength] = useState<"xs"|"sm"|"md"|"lg">("md");
  const [notes, setNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  
  // Sample lead state for preview
  const [sample, setSample] = useState({
    firstName: "Alex",
    company: "Acme Co",
    title: "Ops Manager",
    city: "Boise",
    state: "ID",
    email: "alex@acme.com",
  });

  // Live preview
  const previewSubject = useMemo(() => renderTemplate(subject, sample as any), [subject, sample]);
  const previewHtml = useMemo(() => renderTemplate(bodyHtml, sample as any), [bodyHtml, sample]);

  // AI Rewrite handler
  async function aiRewrite() {
    if (!bodyHtml.trim()) {
      alert("Please enter some content first");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html: bodyHtml, intent, length, notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rewrite failed");
      setBodyHtml(data.html);
      setSubjectSuggestions(data.subject_suggestions || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  // Extract detected variables for display
  const detectedVars = useMemo(() => {
    const VAR_RE = /\{\{(\w+)\|?[^}]*\}\}/g;
    const vars = new Set<string>();
    let match;
    while ((match = VAR_RE.exec(subject + bodyHtml)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars).sort();
  }, [subject, bodyHtml]);

  // Lint warnings
  const lintWarnings = useMemo(() => lintTemplate(bodyHtml), [bodyHtml]);

  const createCampaign = async () => {
    if (!selectedLeadIds?.length) {
      alert("Select at least one lead");
      return;
    }
    
    // Validate unknown variables
    const unknown = new Set([
      ...findUnknownVars(subject),
      ...findUnknownVars(bodyHtml)
    ]);
    if (unknown.size) {
      alert(`Unknown variables: ${[...unknown].join(", ")}`);
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await fetch("/api/campaigns/create-and-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          body_html: bodyHtml,
          schedule_at: new Date(scheduleAt).toISOString(),
          daily_limit: dailyLimit,
          lead_ids: selectedLeadIds
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error ? JSON.stringify(data.error) : "Failed to create campaign");
        return;
      }
      
      setOpen(false);
      router.refresh();
      router.push("/dashboard/queue"); // show queue after creation
    } catch (error) {
      console.error("Error creating campaign:", error);
      alert("Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!selectedLeadIds?.length}>New Campaign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: inputs */}
          <div className="space-y-3">
            <Input 
              placeholder="Campaign name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div className="space-y-2">
              {/* Subject field with suggestions */}
              <div className="flex items-center gap-2">
                <Input 
                  placeholder="Subject" 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)}
                  className="flex-1"
                />
                {subjectSuggestions.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {subjectSuggestions.map((s,i)=>(
                      <Button key={i} variant="secondary" size="sm" onClick={()=>setSubject(s)}>{s}</Button>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Toolbar */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border p-2 bg-muted/30">
                <Select value={intent} onValueChange={(v:any)=>setIntent(v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Style" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shorter">Shorter</SelectItem>
                    <SelectItem value="friendlier">Friendlier</SelectItem>
                    <SelectItem value="curious">More curious</SelectItem>
                    <SelectItem value="punchier">Punchier</SelectItem>
                    <SelectItem value="formal">More formal</SelectItem>
                    <SelectItem value="rewrite">General rewrite</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={length} onValueChange={(v:any)=>setLength(v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Length" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xs">Very short</SelectItem>
                    <SelectItem value="sm">Short</SelectItem>
                    <SelectItem value="md">Medium</SelectItem>
                    <SelectItem value="lg">Long</SelectItem>
                  </SelectContent>
                </Select>

                <input
                  className="flex-1 min-w-[200px] rounded-md border px-2 py-1 text-sm"
                  placeholder="Optional guidance (e.g., add a 1-sentence CTA)"
                  value={notes}
                  onChange={e=>setNotes(e.target.value)}
                />

                <Button onClick={aiRewrite} disabled={aiLoading}>
                  {aiLoading ? "Rewriting…" : "AI Rewrite"}
                </Button>
              </div>

              {/* Body editor */}
              <Textarea 
                placeholder="HTML body (you can paste rich HTML)" 
                value={bodyHtml} 
                onChange={e => setBodyHtml(e.target.value)} 
                rows={8} 
              />

              {/* Detected variables */}
              {detectedVars.length > 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-medium">Detected vars:</span>
                  <div className="flex gap-1 flex-wrap">
                    {detectedVars.map(v => (
                      <code key={v} className="bg-muted px-1 py-0.5 rounded">{v}</code>
                    ))}
                  </div>
                </div>
              )}

              {/* Lint warnings */}
              {lintWarnings.length > 0 && (
                <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-md p-2 space-y-1">
                  {lintWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span>⚠️</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Copy tips */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg space-y-1">
              <div className="font-medium mb-1">Template Tips:</div>
              <div>Personalize: <code className="bg-background px-1 rounded">Hi {{firstName|there}},</code></div>
              <div>Company: <code className="bg-background px-1 rounded">We help {{company|teams like yours}}...</code></div>
              <div>Location: <code className="bg-background px-1 rounded">Noticed you're in {{city|your city}}, {{state|your state}}...</code></div>
              <div className="mt-1">Available: <code className="bg-background px-1 rounded">{{firstName}} {{lastName}} {{company}} {{title}} {{city}} {{state}} {{email}} {{name}}</code></div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Sample firstName</label>
                <Input 
                  placeholder="firstName" 
                  value={sample.firstName}
                  onChange={e => setSample(s => ({ ...s, firstName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sample company</label>
                <Input 
                  placeholder="company" 
                  value={sample.company}
                  onChange={e => setSample(s => ({ ...s, company: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sample city</label>
                <Input 
                  placeholder="city" 
                  value={sample.city}
                  onChange={e => setSample(s => ({ ...s, city: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sample state</label>
                <Input 
                  placeholder="state" 
                  value={sample.state}
                  onChange={e => setSample(s => ({ ...s, state: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Schedule at (local)</label>
                <Input 
                  type="datetime-local" 
                  value={scheduleAt} 
                  onChange={e => setScheduleAt(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Daily limit</label>
                <Input 
                  type="number" 
                  min={1} 
                  value={dailyLimit} 
                  onChange={e => setDailyLimit(parseInt(e.target.value || "1"))} 
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {selectedLeadIds.length} lead(s) selected. Emails will enter the Send Queue and release after your scheduled time.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createCampaign} disabled={loading}>
                {loading ? "Creating..." : "Create & Queue"}
              </Button>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="border rounded-2xl p-3 overflow-auto">
            <div className="text-xs uppercase text-muted-foreground mb-2">Preview</div>
            <div className="font-medium mb-2">Subject: {previewSubject || <span className="opacity-60">—</span>}</div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml || "<em>(empty)</em>" }} />
            <div className="mt-3 text-[10px] text-muted-foreground">
              Vars: <code>{`{{firstName}} {{company}} {{title}} {{city}} {{state}} {{email}}`}</code> |
              Fallbacks: <code>{`{{firstName|there}}`}</code>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

