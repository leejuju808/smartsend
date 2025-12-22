"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Loader2 } from "lucide-react";

type RewriteMode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "warmer"
  | "punchier";

type Props = {
  subject: string;
  body: string;
  onRewrite: (patch: { subject?: string; body?: string }) => void;
};

export function SmartTemplateRewriter({ subject, body, onRewrite }: Props) {
  const [loadingMode, setLoadingMode] = useState<RewriteMode | null>(null);

  const runRewrite = async (mode: RewriteMode) => {
    if (loadingMode) return;
    setLoadingMode(mode);
    try {
      const res = await fetch("/api/templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          mode,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("rewrite error", json);
        setLoadingMode(null);
        return;
      }

      onRewrite({
        subject: json.subject,
        body: json.body,
      });
    } catch (err) {
      console.error("rewrite exception", err);
    } finally {
      setLoadingMode(null);
    }
  };

  const buttonLabel = (mode: RewriteMode) => {
    switch (mode) {
      case "improve":
        return "Improve";
      case "shorter":
        return "Shorter";
      case "more_casual":
        return "More casual";
      case "more_formal":
        return "More formal";
      case "warmer":
        return "Warmer";
      case "punchier":
        return "Punchier subject";
      default:
        return mode;
    }
  };

  const modes: RewriteMode[] = [
    "improve",
    "shorter",
    "more_casual",
    "more_formal",
    "punchier",
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 text-[11px]">
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-950/80 border border-slate-800 px-2 py-[2px]">
          <Sparkles className="h-3 w-3 text-amber-300" />
          <span className="text-[10px] text-slate-200">
            Smart rewriter
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {modes.map((mode) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => runRewrite(mode)}
                  disabled={!!loadingMode}
                >
                  {loadingMode === mode ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {buttonLabel(mode)}
                    </>
                  ) : (
                    buttonLabel(mode)
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-xs">
                {mode === "improve" &&
                  "Clean up writing, improve clarity and flow."}
                {mode === "shorter" &&
                  "Make the email more concise without losing the core message."}
                {mode === "more_casual" &&
                  "More casual, friendly tone while still professional."}
                {mode === "more_formal" &&
                  "More formal, polished tone for executives."}
                {mode === "punchier" &&
                  "Punchier subject line and more direct copy."}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
