// components/campaigns/template-rewriter-controls.tsx

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";

type RewriteStyle =
  | "shorter"
  | "longer"
  | "more_casual"
  | "more_formal"
  | "more_personalized"
  | "higher_reply_rate";

type Props = {
  workspaceId?: string;
  subject: string;
  body: string;
  onApply: (next: { subject: string; body: string }) => void;
};

export function TemplateRewriterControls({
  workspaceId,
  subject,
  body,
  onApply,
}: Props) {
  const [style, setStyle] = React.useState<RewriteStyle>("higher_reply_rate");
  const [context, setContext] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleRewrite = async () => {
    if (!subject.trim() || !body.trim()) {
      // up to you: show a toast instead
      alert("Add a subject and body before using AI rewrite.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          style,
          context: context || undefined,
          workspaceId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.subject || !data.body) {
        console.error("Rewrite error:", data);
        alert("Failed to rewrite template. Try again.");
        return;
      }

      onApply({
        subject: data.subject,
        body: data.body,
      });
    } catch (err) {
      console.error("Rewrite error:", err);
      alert("Failed to rewrite template. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">Smart Rewrite</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Use AI to tweak this subject & email for better replies.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Rewrite style</label>
        <Select
          value={style}
          onValueChange={(val) =>
            setStyle(val as RewriteStyle)
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Choose style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="higher_reply_rate">
              High reply rate (default)
            </SelectItem>
            <SelectItem value="shorter">Shorter & punchier</SelectItem>
            <SelectItem value="longer">Longer & more detailed</SelectItem>
            <SelectItem value="more_casual">More casual</SelectItem>
            <SelectItem value="more_formal">More formal</SelectItem>
            <SelectItem value="more_personalized">
              More personalized
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">
          Extra context (optional)
        </label>
        <Textarea
          className="h-20 resize-none text-xs"
          placeholder="Audience, offer, tone, etc. (e.g. 'Local HVAC owners, booking more service calls, keep it low-friction and simple.')"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <Button
        type="button"
        className="w-full justify-center"
        size="sm"
        disabled={loading}
        onClick={handleRewrite}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Rewriting…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Rewrite with AI
          </>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground">
        Tip: you can rewrite multiple times. Adjust the style or context and hit
        rewrite again until it feels right.
      </p>
    </div>
  );
}

































































