"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/Card";

type Lead = { id: string; email: string; first_name?: string|null; last_name?: string|null; company?: string|null };

export function StepPreview({
  campaignId,
  stepNo
}: { campaignId: string; stepNo: number }) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  async function loadLeads() {
    const r = await fetch(`/api/campaigns/${campaignId}/leads/basic?limit=50`);
    const j = await r.json();
    if (r.ok) setLeads(j.leads || []);
  }

  useEffect(()=>{ 
    if (open) {
      loadLeads();
    }
  }, [open, campaignId]);

  const selected = useMemo(()=> leads.find(l => l.id === leadId), [leadId, leads]);

  // Auto-preview when lead is selected
  useEffect(() => {
    if (leadId && open && leads.length > 0) {
      preview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, open, stepNo, campaignId]);

  async function preview() {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/render-step`, {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ 
          campaign_id: campaignId, 
          lead_id: leadId, 
          step_no: stepNo 
        })
      });
      const j = await r.json();
      setLoading(false);
      if (!j.ok) { 
        alert(j.error || "Preview failed"); 
        return; 
      }
      setSubject(j.subject || "");
      setHtml(j.body_html || "");
    } catch (e) {
      setLoading(false);
      alert("Preview failed: " + String(e));
    }
  }

  async function sendNow() {
    if (!leadId || !testEmail) {
      alert("Please enter an email address");
      return;
    }
    
    setSending(true);
    try {
      const r = await fetch(`/api/test-send`, {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ 
          campaign_id: campaignId, 
          lead_id: leadId, 
          step_no: stepNo,
          to: testEmail
        })
      });
      const j = await r.json();
      setSending(false);
      if (!j.ok) { 
        alert(j.error || "Send failed"); 
        return; 
      }
      alert(`Test email sent to ${testEmail}\nSubject: ${j.subject}`);
      setTestEmail("");
      setOpen(false);
    } catch (e) {
      setSending(false);
      alert("Send failed: " + String(e));
    }
  }
  
  // Set default email when lead is selected
  useEffect(() => {
    if (selected?.email) {
      setTestEmail(selected.email);
    }
  }, [selected]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Preview</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview — Step {stepNo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs">Lead</Label>
              <Select onValueChange={(v)=>setLeadId(v)} value={leadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead to merge…" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.email} {l.first_name || l.last_name || l.company ? ` — ${[l.first_name, l.last_name].filter(Boolean).join(" ")}${l.company?` @ ${l.company}`:""}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={preview} disabled={!leadId || loading} variant="outline">
                {loading ? "Rendering…" : "Refresh"}
              </Button>
            </div>
          </div>

          {!!selected && (
            <div className="text-xs text-muted-foreground">
              Merging for <span className="font-medium">{selected.email}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} readOnly />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Body</Label>
            <Card className="p-3 prose prose-sm max-w-none">
              {/* HTML preview (trusted from your templates) */}
              <div dangerouslySetInnerHTML={{ __html: html || "<p>(empty)</p>" }} />
            </Card>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <Label className="text-xs">Send preview to:</Label>
              <Input 
                placeholder="email@example.com" 
                value={testEmail} 
                onChange={e=>setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button onClick={sendNow} disabled={!testEmail || !leadId || sending} size="sm">
                {sending ? "Sending…" : "Send Test"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

