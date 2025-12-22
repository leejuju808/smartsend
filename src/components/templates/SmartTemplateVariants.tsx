"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";

type VariantMode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "warmer"
  | "punchier";

type Variant = {
  subject: string;
  body: string;
};

type Props = {
  subject: string;
  body: string;
  onUseVariant: (variant: Variant) => void;
};

export function SmartTemplateVariants({ subject, body, onUseVariant }: Props) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<VariantMode>("improve");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadVariants = async () => {
    if (!subject && !body) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          mode,
          count: 3,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("variants error", json);
        setError(json.error || "Failed to generate variants");
        setVariants([]);
        return;
      }
      setVariants(json.variants || []);
    } catch (err) {
      console.error("variants exception", err);
      setError("Failed to generate variants");
      setVariants([]);
    } finally {
      setLoading(false);
    }
  };

  const modes: { key: VariantMode; label: string }[] = [
    { key: "improve",      label: "Improve" },
    { key: "shorter",      label: "Shorter" },
    { key: "more_casual",  label: "More casual" },
    { key: "more_formal",  label: "More formal" },
    { key: "warmer",       label: "Warmer" },
    { key: "punchier",     label: "Punchier" },
  ];

  return (
    <div className="space-y-2 mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-950/80 border border-slate-800 px-2 py-[2px]">
            <Sparkles className="h-3 w-3 text-amber-300" />
            <span className="text-[10px] text-slate-200">
              Smart variants
            </span>
          </div>
          <div className="flex flex-wrap gap-1 text-[10px]">
            {modes.map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`rounded-full px-2 py-[2px] ${
                    active
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-900/80"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={loadVariants}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Generate 3 variants
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="text-[10px] text-red-300">{error}</div>
      )}

      {variants.length > 0 && (
        <div className="grid gap-2 md:grid-cols-3">
          {variants.map((v, idx) => (
            <Card
              key={idx}
              className="bg-slate-950/80 border-slate-800 flex flex-col"
            >
              <CardContent className="p-2 flex flex-col gap-2 h-full">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-slate-900 border-slate-700 text-[9px]">
                    Variant {idx + 1}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold line-clamp-2">
                    {v.subject || "(no subject)"}
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-pre-line line-clamp-[10]">
                    {v.body}
                  </div>
                </div>
                <div className="mt-auto pt-1">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[10px] w-full"
                    onClick={() => onUseVariant(v)}
                  >
                    Use this variant
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}




