// Block 8410 — Smart Template Rewriter v1
// app/(dashboard)/templates/[templateId]/_components/template-editor.tsx

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string | null;
  subject: string | null;
  body: string | null;
}

interface VariantRow {
  id: string;
  label: string | null;
  intent: string | null;
  subject: string | null;
  body: string | null;
  created_at: string;
}

interface TemplateEditorProps {
  template: Template;
  variants: VariantRow[];
}

const intentOptions = [
  { value: "shorter", label: "Shorter & punchier" },
  { value: "longer", label: "Longer (more context)" },
  { value: "more_casual", label: "More casual" },
  { value: "more_formal", label: "More formal" },
  { value: "new_angle", label: "New angle" },
  { value: "subject_only", label: "Subject lines only" },
];

export function TemplateEditor({ template, variants }: TemplateEditorProps) {
  const router = useRouter();

  const [name, setName] = React.useState(template.name ?? "");
  const [subject, setSubject] = React.useState(template.subject ?? "");
  const [body, setBody] = React.useState(template.body ?? "");
  const [selectedIntent, setSelectedIntent] = React.useState<string>("shorter");
  const [isRewriting, setIsRewriting] = React.useState(false);
  const [showVariants, setShowVariants] = React.useState(true);
  const [localVariants, setLocalVariants] = React.useState<VariantRow[]>(variants);

  const handleRewrite = async () => {
    try {
      setIsRewriting(true);
      const res = await fetch(`/api/templates/${template.id}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: selectedIntent }),
      });

      if (res.status === 402) {
        console.error("Rewriter is Pro-only");
        // Optionally surface a toast or a banner
        alert("Smart Template Rewriter is available on Pro plans. Visit the Billing page to upgrade.");
        return;
      }

      if (!res.ok) {
        console.error("Rewrite call failed");
        return;
      }

      const json = await res.json();
      const newVariants = (json.variants ?? []) as VariantRow[];
      setLocalVariants((prev) => [...newVariants, ...prev]);
      setShowVariants(true);
      router.refresh(); // to sync server-side list if needed
    } finally {
      setIsRewriting(false);
    }
  };

  const applyVariant = (variant: VariantRow) => {
    setSubject(variant.subject ?? "");
    setBody(variant.body ?? "");
  };

  const intentLabel = intentOptions.find((o) => o.value === selectedIntent)?.label;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
      {/* Left: main editor */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Template Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., 'Speed-to-Lead – HVAC Owners'"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Subject
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Body
          </label>
          <Textarea
            className="min-h-[260px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Email body..."
          />
        </div>

        {/* TODO: Save button can hook to your existing template save API */}
        <div className="flex justify-end">
          <Button
            type="button"
            className="text-sm"
            onClick={() => {
              // You can wire this to your save route; placeholder for now
              console.log("TODO: save template");
            }}
          >
            Save template
          </Button>
        </div>
      </div>

      {/* Right: AI rewriter + variants */}
      <div className="space-y-3 rounded-2xl border bg-card p-3 lg:p-4">
        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Smart Template Rewriter
            </span>
          </div>
          <button
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowVariants((v) => !v)}
          >
            {showVariants ? "Hide variants" : "Show variants"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition",
                showVariants ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {intentOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={selectedIntent === opt.value ? "default" : "outline"}
              className="text-[11px]"
              onClick={() => setSelectedIntent(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          className="w-full text-sm mt-1"
          disabled={isRewriting}
          onClick={handleRewrite}
        >
          {isRewriting ? "Generating variants…" : "Rewrite with AI"}
        </Button>

        {showVariants && (
          <div className="mt-3 border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Recent variants
              </span>
              {intentLabel && (
                <Badge variant="outline" className="text-[10px]">
                  Mode: {intentLabel}
                </Badge>
              )}
            </div>

            {localVariants.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No AI variants yet. Choose a mode and click "Rewrite with AI".
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {localVariants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="w-full text-left rounded-xl border bg-background/60 px-3 py-2 hover:bg-muted/70 transition"
                    onClick={() => applyVariant(v)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">
                          {v.label || "Variant"}
                        </span>
                        {v.intent && (
                          <Badge variant="outline" className="text-[9px]">
                            {v.intent}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(v.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    {v.subject && (
                      <div className="text-[11px] font-medium mb-1 line-clamp-1">
                        {v.subject}
                      </div>
                    )}
                    {v.body && (
                      <div className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-line">
                        {v.body}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

