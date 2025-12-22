"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";

type TonePreset = "short_direct" | "friendly_helpful" | "detailed";
type Mode = "generate" | "regenerate" | "improve" | "shorten";

interface AIReplyCopilotProps {
  threadId: string;
  onInsert: (draft: string) => void;
}

export function AIReplyCopilot({ threadId, onInsert }: AIReplyCopilotProps) {
  const [tone, setTone] = useState<TonePreset>("friendly_helpful");
  const [draft, setDraft] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReply = async (mode: Mode = "generate") => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/reply-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          tone,
          mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate reply");
      }

      const data = await response.json();
      setDraft(data.draft || "");
      setIsOpen(true);
    } catch (err: any) {
      setError(err.message || "Failed to generate reply");
      console.error("AI Reply Copilot error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (draft) {
      onInsert(draft);
    }
  };

  const toneLabels = {
    short_direct: "Short & Direct",
    friendly_helpful: "Friendly & Helpful",
    detailed: "Detailed / High-Context",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4" />
        <span>AI Reply Copilot</span>
      </div>

      {/* Tone Selector */}
      <div className="flex gap-2">
        {(["short_direct", "friendly_helpful", "detailed"] as TonePreset[]).map(
          (t) => (
            <Button
              key={t}
              variant={tone === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTone(t)}
              className="text-xs"
            >
              {toneLabels[t]}
            </Button>
          )
        )}
      </div>

      {/* Generate Button */}
      <Button
        onClick={() => generateReply("generate")}
        disabled={isGenerating}
        className="w-full"
        size="sm"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          "Generate Reply"
        )}
      </Button>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      {/* Draft Display */}
      {draft && (
        <div className="space-y-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <span>AI Draft</span>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {isOpen && (
            <div className="border rounded-lg p-3 bg-muted/40">
              <div className="text-sm whitespace-pre-wrap mb-3">{draft}</div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleInsert}>
                  Insert Reply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateReply("regenerate")}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Regenerate"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateReply("improve")}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Improve"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateReply("shorten")}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Shorten"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

