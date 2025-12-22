"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { lintTemplate } from "@/lib/templateLint";

export function StepComposerRewriter({ campaignId, stepNo }: { campaignId: string; stepNo: number }) {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [voice, setVoice] = useState<"neutral"|"warm"|"direct"|"friendly"|"professional"|"playful">("professional");
  const [length, setLength] = useState<"short"|"medium"|"long">("short");
  const [objective, setObjective] = useState<"book_call"|"spark_reply"|"soft_intro"|"follow_up"|"bump"|"breakup">("spark_reply");
  const [cta, setCta] = useState<"calendar"|"open_question"|"binary"|"soft_exit"|"link_click">("open_question");

  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const rewrite = async () => {
    if (!html.trim()) {
      alert("Please enter a body template");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_template: subject,
          body_html_template: html,
          voice, 
          length, 
          objective,
          cta_style: cta,
          constraints: { keep_merge_tags: true, keep_links: true }
        })
      });

      if (!r.ok) {
        const error = await r.json();
        alert(`Error: ${error.error || "Failed to rewrite"}`);
        return;
      }

      const result = await r.json();
      setOut(result);

      // Run lint check
      const lint = lintTemplate(result.subject || "", result.html || "");
      if (lint.warnings.length > 0) {
        console.warn("Template lint warnings:", lint.warnings);
      }
    } catch (error: any) {
      console.error("Rewrite error:", error);
      alert(`Error: ${error.message || "Failed to rewrite"}`);
    } finally {
      setLoading(false);
    }
  };

  const saveAsVariants = async () => {
    if (!out) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const payload = {
        campaign_id: campaignId,
        step_no: stepNo,
        primary: { subject: out.subject, html: out.html },
        ab: out.ab_suggestions?.[1] ? { 
          subject: out.ab_suggestions[1].subject, 
          html: out.ab_suggestions[1].html 
        } : null
      };

      const r = await fetch("/api/variants/save-from-rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || "Failed to save");
      }

      const result = await r.json();
      setSaveMsg("Variants saved successfully! They should appear in the A/B panel below.");
      setTimeout(() => {
        setSaveMsg("");
      }, 3000);
    } catch (error: any) {
      console.error("Save error:", error);
      alert(`Error: ${error.message || "Failed to save variants"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Smart Template Rewriter</div>
        <div className="text-xs text-muted-foreground">Keeps {{merge_tags}} intact. Creates A/B in one click.</div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <label className="text-xs">Voice</label>
          <Select value={voice} onValueChange={(v: any) => setVoice(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Voice" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="playful">Playful</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs">Length</label>
          <Select value={length} onValueChange={(v: any) => setLength(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Length" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs">Objective</label>
          <Select value={objective} onValueChange={(v: any) => setObjective(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Objective" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spark_reply">Spark Reply</SelectItem>
              <SelectItem value="book_call">Book Call</SelectItem>
              <SelectItem value="soft_intro">Soft Intro</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="bump">Bump</SelectItem>
              <SelectItem value="breakup">Breakup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs">Original Subject</label>
          <Input 
            value={subject} 
            onChange={(e) => setSubject(e.target.value)} 
            placeholder="Subject template (optional)" 
          />
          <label className="text-xs">Original Body (HTML w/ {{merge_tags}})</label>
          <Textarea 
            className="min-h-[220px]" 
            value={html} 
            onChange={(e) => setHtml(e.target.value)} 
            placeholder="<p>Hi {{first_name}}, ...</p>" 
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs">CTA Style</label>
          <Select value={cta} onValueChange={(v: any) => setCta(v)}>
            <SelectTrigger>
              <SelectValue placeholder="CTA Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open_question">Open Question</SelectItem>
              <SelectItem value="binary">Binary (Yes/No)</SelectItem>
              <SelectItem value="calendar">Calendar Windows</SelectItem>
              <SelectItem value="link_click">Link Click</SelectItem>
              <SelectItem value="soft_exit">Soft Exit</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2 pt-2">
            <Button onClick={rewrite} disabled={loading || !html.trim()}>
              {loading ? "Rewriting..." : "Rewrite"}
            </Button>
            <Button 
              variant="outline" 
              onClick={saveAsVariants} 
              disabled={!out || saving}
            >
              {saving ? "Saving..." : "Save as A/B"}
            </Button>
          </div>

          {saveMsg && (
            <div className="text-xs text-green-600">{saveMsg}</div>
          )}

          {out && (
            <div className="mt-3 space-y-3">
              <div className="text-xs text-muted-foreground">Preview A</div>
              <div className="border rounded-xl p-3">
                <div className="font-medium text-sm mb-2">Subject: {out.subject}</div>
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none" 
                  dangerouslySetInnerHTML={{ __html: out.html }} 
                />
              </div>
              {out.ab_suggestions?.[1] && (
                <>
                  <div className="text-xs text-muted-foreground">Suggestion B</div>
                  <div className="border rounded-xl p-3">
                    <div className="font-medium text-sm mb-2">Subject: {out.ab_suggestions[1].subject}</div>
                    <div 
                      className="prose prose-sm dark:prose-invert max-w-none" 
                      dangerouslySetInnerHTML={{ __html: out.ab_suggestions[1].html }} 
                    />
                  </div>
                </>
              )}
              {out?.notes?.warnings?.length ? (
                <div className="text-xs text-yellow-600">
                  Warnings: {out.notes.warnings.join("; ")}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
