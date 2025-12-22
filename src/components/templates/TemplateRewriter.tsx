"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/Textarea";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function TemplateRewriter({ 
  templateId, 
  initialHtml,
  onHtmlChange
}: { 
  templateId: string; 
  initialHtml: string;
  onHtmlChange?: (html: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState(initialHtml);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // Get current user ID
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    setHtml(initialHtml);
  }, [initialHtml]);

  async function rewrite() {
    if (!userId) {
      alert("Please sign in to use AI rewrite");
      return;
    }
    if (!prompt.trim()) {
      alert("Please enter a rewrite prompt");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/functions/v1/ai-rewrite-template", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          user_id: userId, 
          template_id: templateId, 
          prompt: prompt.trim(),
          vars: {} // Can be extended later to pass variables
        })
      });
      
      const j = await res.json();
      if (j.ok) {
        setHtml(j.html);
        // Sync back to parent component
        onHtmlChange?.(j.html);
        // Optionally show success message
      } else {
        alert(j.error || "Rewrite failed");
      }
    } catch (e) {
      alert("Error: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        AI Rewrite ✨
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>AI Template Rewriter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Rewrite Prompt</label>
              <Input 
                placeholder="e.g. make it shorter and friendlier" 
                value={prompt} 
                onChange={e => setPrompt(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Template HTML</label>
              <Textarea 
                className="min-h-[250px] font-mono text-sm" 
                value={html} 
                onChange={e => setHtml(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Close
              </Button>
              <Button disabled={loading || !prompt.trim()} onClick={rewrite}>
                {loading ? "Rewriting..." : "Rewrite"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
