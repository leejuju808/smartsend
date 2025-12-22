"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function TemplatesPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [qty, setQty] = useState(3);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!subject || !html) {
      toast.error("Please provide both subject and body");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignId,
          baseSubject: subject,
          baseHtml: html,
          qty,
          tone: "curious",
          ctaStyle: "reply-yes",
          length: "short"
        })
      });
      const j = await res.json();
      if (j.error) {
        toast.error(j.error);
      } else {
        toast.success(`Created ${j.variants?.length || 0} variants`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate variants");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold">Template Variants</h1>
      
      <div className="grid gap-3">
        <Input 
          placeholder="Base subject" 
          value={subject} 
          onChange={e => setSubject(e.target.value)} 
        />
        <Textarea 
          placeholder="Base HTML (use {{first_name}}, {{company}}, {{cta_url}})"
          value={html} 
          onChange={e => setHtml(e.target.value)} 
          className="min-h-[200px]" 
        />
        <div className="flex items-center gap-3">
          <Input 
            type="number" 
            min={1} 
            max={5} 
            value={qty} 
            onChange={e => setQty(parseInt(e.target.value || "1"))} 
            className="w-24" 
          />
          <span className="text-sm text-muted-foreground">variants</span>
          <Button onClick={generate} disabled={loading}>
            {loading ? "Generating..." : "Generate Variants"}
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Variants are auto-split on enqueue. Use merge tags like <code>{`{{first_name}}`}</code>, <code>{`{{company}}`}</code>, <code>{`{{cta_url}}`}</code>.
      </p>
    </div>
  );
}