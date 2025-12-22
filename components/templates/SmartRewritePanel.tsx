"use client";

import { useState } from "react";
import { useTemplateRewriter } from "@/hooks/useTemplateRewriter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "more_direct"
  | "variant";

const LABELS: Record<Mode, string> = {
  improve: "Improve",
  shorter: "Shorter",
  more_casual: "More casual",
  more_formal: "More formal",
  more_direct: "More direct",
  variant: "A/B variant",
};

type Props = {
  subject: string;
  body: string;
  onApply: (subject: string, body: string) => void;
  onCreateVariant?: (subject: string, body: string) => void; // used in sequence steps
  context?: string;
};

export function SmartRewritePanel({
  subject,
  body,
  onApply,
  onCreateVariant,
  context,
}: Props) {
  const { rewrite, loading, error } = useTemplateRewriter();
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<Mode | null>(null);

  const runMode = async (mode: Mode) => {
    setActiveMode(mode);
    const result = await rewrite({
      subject,
      body,
      mode,
      context,
    });
    if (!result) return;
    setPreviewSubject(result.subject ?? null);
    setPreviewBody(result.body);
  };

  const applyRewrite = () => {
    if (!previewBody && !previewSubject) return;
    onApply(previewSubject ?? subject, previewBody ?? body);
  };

  const pushAsVariant = () => {
    if (!onCreateVariant) return;
    if (!previewBody && !previewSubject) return;
    onCreateVariant(previewSubject ?? subject, previewBody ?? body);
  };

  const modes: Mode[] = [
    "improve",
    "shorter",
    "more_casual",
    "more_formal",
    "more_direct",
    "variant",
  ];

  const hasPreview = previewBody || previewSubject;

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/40 mt-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold">Smart Rewrite (AI)</span>
        <span className="text-[10px] text-muted-foreground">
          Choose a mode and we'll generate a new version.
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <Button
            key={m}
            type="button"
            size="xs"
            variant={activeMode === m ? "default" : "outline"}
            className={cn("text-[11px]", activeMode === m && "font-semibold")}
            disabled={loading && activeMode === m}
            onClick={() => runMode(m)}
          >
            {LABELS[m]}
          </Button>
        ))}
      </div>

      {error && (
        <p className="text-[11px] text-red-500">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-[11px] text-muted-foreground">
          Rewriting your template…
        </p>
      )}

      {hasPreview && !loading && (
        <div className="border rounded p-2 space-y-2 bg-background">
          <p className="text-[11px] font-semibold mb-1">
            Suggested version
          </p>
          {previewSubject !== null && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">Subject</p>
              <Input
                value={previewSubject}
                onChange={(e) => setPreviewSubject(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Body</p>
            <Textarea
              value={previewBody ?? ""}
              onChange={(e) => setPreviewBody(e.target.value)}
              className="text-xs h-32"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" type="button" onClick={applyRewrite}>
              Replace current
            </Button>
            {onCreateVariant && (
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={pushAsVariant}
              >
                Save as variant
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}







