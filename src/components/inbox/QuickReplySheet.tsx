"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TemplateRewriter } from "@/components/templates/TemplateRewriter";

type Template = {
  id: string;
  name: string;
  body_html: string;
};

const commonVars = ["first_name", "company", "title", "city", "state", "country", "email", "full_name", "last_name", "website"];

function insertVar(name: string, setHtml: (v: string) => void, html: string) {
  const token = `{{ ${name} }}`;
  const cursorPos = (document.activeElement as HTMLTextAreaElement)?.selectionStart || html.length;
  const before = html.slice(0, cursorPos);
  const after = html.slice(cursorPos);
  const newHtml = before + (before.endsWith(" ") || before === "" ? "" : " ") + token + (after.startsWith(" ") ? "" : " ") + after;
  setHtml(newHtml);
  // Restore cursor position after token
  setTimeout(() => {
    const textarea = document.activeElement as HTMLTextAreaElement;
    if (textarea) {
      const newPos = cursorPos + token.length + 1;
      textarea.setSelectionRange(newPos, newPos);
    }
  }, 0);
}

export function QuickReplySheet() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: CustomEvent<{ threadId: string }>) {
      setThreadId(e.detail.threadId);
      setOpen(true);
    }
    window.addEventListener("openQuickReply", handler as EventListener);
    return () => window.removeEventListener("openQuickReply", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!open || !threadId) return;
    (async () => {
      // Load templates
      const res = await fetch("/api/reply-templates");
      const j = await res.json();
      setTemplates(j.rows ?? []);
      if (j.rows?.length) {
        setTplId(j.rows[0].id);
        setHtml(j.rows[0].body_html);
      }
      // Load thread meta for campaign_id and lead_id
      const tRes = await fetch(`/api/thread-meta?thread=${threadId}`);
      const tData = await tRes.json();
      if (tData.campaign_id && tData.lead_id) {
        setCampaignId(tData.campaign_id);
        setLeadId(tData.lead_id);
      }
    })();
  }, [open, threadId]);

  function onTplChange(id: string) {
    setTplId(id);
    const tpl = templates.find(t => t.id === id);
    setHtml(tpl?.body_html || "");
  }

  async function refreshPreview() {
    if (!campaignId || !leadId || !html) {
      setPreview(html);
      return;
    }
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const r = await fetch(`${supabaseUrl}/functions/v1/render-merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId, subject_template: "", html_template: html })
      });
      const j = await r.json();
      setPreview(j.ok ? j.html : html);
    } catch (e) {
      setPreview(html);
    }
  }

  useEffect(() => {
    if (html && campaignId && leadId) {
      const timer = setTimeout(refreshPreview, 500);
      return () => clearTimeout(timer);
    } else {
      setPreview(html);
    }
  }, [html, campaignId, leadId]);

  async function send() {
    // Render merge before sending if we have campaign and lead
    let finalHtml = html;
    if (campaignId && leadId) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const r = await fetch(`${supabaseUrl}/functions/v1/render-merge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId, subject_template: "", html_template: html })
        });
        const j = await r.json();
        if (j.ok) {
          finalHtml = j.html;
        }
      } catch (e) {
        console.error("render-merge failed:", e);
      }
    }

    const res = await fetch("/functions/v1/send-quick-reply", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ thread_id: threadId, template_id: tplId, custom_html: finalHtml })
    });
    const j = await res.json();
    if (j.ok) {
      setOpen(false);
      // Optionally trigger a refresh
      window.dispatchEvent(new CustomEvent("refreshInbox"));
    } else {
      alert(j.error || "Failed to send reply");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Quick Reply</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">Template</div>
            {tplId && <TemplateRewriter templateId={tplId} initialHtml={html} onHtmlChange={setHtml} />}
          </div>
          <Select value={tplId} onValueChange={onTplChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between">
            <div className="text-sm">Message (HTML)</div>
            <div className="flex items-center gap-2">
              <Select value="" onValueChange={(v) => v && insertVar(v, setHtml, html)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Variables" />
                </SelectTrigger>
                <SelectContent>
                  {commonVars.map(v => (
                    <SelectItem key={v} value={v}>{`{{ ${v} }}`}</SelectItem>
                  ))}
                  <SelectItem value="first_name | capitalize">{`{{ first_name | capitalize }}`}</SelectItem>
                  <SelectItem value="title || 'your role'">{`{{ title || 'your role' }}`}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={refreshPreview}>Preview</Button>
            </div>
          </div>
          <Textarea
            className="min-h-[200px] font-mono text-sm"
            value={html}
            onChange={e=>setHtml(e.target.value)}
          />
          {preview && preview !== html && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Preview with lead data:</div>
              <div className="border rounded-md p-3 max-h-72 overflow-auto bg-muted/20" dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={send}>Send</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

