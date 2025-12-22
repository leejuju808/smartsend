"use client";
import { useState } from "react";
import RewriterSheet from "@/components/rewrite/RewriterSheet";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/Input";

/**
 * Example compose page showing how to integrate RewriterSheet
 * This can be adapted to your existing template compose page
 */
export default function ComposeTemplate({ template }: { template?: any }) {
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [templateId, setTemplateId] = useState(template?.id || null);
  const [saving, setSaving] = useState(false);

  const applyVariant = (v: { subject: string; body: string }) => {
    setSubject(v.subject);
    setBody(v.body);
    
    // Optionally save variant to database
    if (templateId) {
      fetch("/api/template-variants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          variant: {
            label: "AI Generated",
            subject: v.subject,
            body: v.body,
            score: v.score,
          },
        }),
      }).catch(console.error);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/templates/save", {
        method: templateId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: templateId,
          subject, 
          body 
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }
      
      const data = await res.json();
      if (data.id) setTemplateId(data.id);
      alert("Template saved!");
    } catch (e: any) {
      alert(e.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Compose Email Template</h1>
      
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line"
          />
        </div>
        
        <div className="grid gap-2">
          <Label>Body</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder="Email body (supports {{first_name}}, {{company}}, etc.)"
          />
        </div>
        
        <div className="flex gap-2">
          <RewriterSheet
            initialSubject={subject}
            initialBody={body}
            onApply={applyVariant}
          />
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

