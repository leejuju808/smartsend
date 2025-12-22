"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Tone = "casual" | "friendly" | "professional" | "direct";
type Length = "short" | "medium" | "long";

interface Variants {
  A: string;
  B: string;
  C: string;
}

interface Props {
  body: string;
  onApply: (rewrittenBody: string) => void;
  onInsertAsVariant?: (rewrittenBody: string) => void;
  campaignId?: string;
  stepIndex?: number;
}

export function AITemplateRewriter({
  body,
  onApply,
  onInsertAsVariant,
  campaignId,
  stepIndex,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("short");
  const [brandVoice, setBrandVoice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variants | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<"A" | "B" | "C" | null>(null);

  const handleRewrite = async () => {
    if (!body.trim()) {
      setError("Please enter email body to rewrite");
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);
    setVariants(null);
    setSelectedVariant(null);

    try {
      const res = await fetch("/api/ai/rewrite-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          tone,
          length,
          brandVoice,
          campaignId,
          stepIndex,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to rewrite template");
      }

      if (data.result && data.result.A && data.result.B && data.result.C) {
        setVariants(data.result);
        if (data.warnings && data.warnings.length > 0) {
          setWarnings(data.warnings);
        }
        // Check validation results
        if (data.validation) {
          const validationWarnings: string[] = [];
          Object.entries(data.validation).forEach(([key, val]: [string, any]) => {
            if (!val.valid && val.missing && val.missing.length > 0) {
              validationWarnings.push(
                `Variant ${key}: Missing placeholders: ${val.missing.join(", ")}`
              );
            }
          });
          if (validationWarnings.length > 0) {
            setWarnings((prev) => [...prev, ...validationWarnings]);
          }
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      console.error("Rewrite error:", err);
      setError(err.message || "Failed to rewrite template");
    } finally {
      setLoading(false);
    }
  };

  const handleUseVariant = (variantKey: "A" | "B" | "C") => {
    if (!variants) return;
    const variantText = variants[variantKey];
    onApply(variantText);
    setOpen(false);
    // Reset state
    setVariants(null);
    setSelectedVariant(null);
    setWarnings([]);
  };

  const handleInsertAsVariant = (variantKey: "A" | "B" | "C") => {
    if (!variants || !onInsertAsVariant) return;
    const variantText = variants[variantKey];
    onInsertAsVariant(variantText);
    setOpen(false);
  };

  const tones: { value: Tone; label: string }[] = [
    { value: "casual", label: "Casual" },
    { value: "friendly", label: "Friendly" },
    { value: "professional", label: "Professional" },
    { value: "direct", label: "Direct" },
  ];

  const lengths: { value: Length; label: string; description: string }[] = [
    { value: "short", label: "Short", description: "Best for cold email" },
    { value: "medium", label: "Medium", description: "Balanced length" },
    { value: "long", label: "Long", description: "More detailed" },
  ];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" />
        Rewrite (AI)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI Template Rewriter
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tone Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Tone
                </label>
                <div className="flex flex-wrap gap-2">
                  {tones.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        tone === t.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Length Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Length
                </label>
                <div className="flex flex-wrap gap-2">
                  {lengths.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setLength(l.value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        length === l.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      title={l.description}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand Voice Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Brand Voice
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBrandVoice(!brandVoice)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      brandVoice ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        brandVoice ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-600">
                    {brandVoice ? "SmartSend Tone" : "None"}
                  </span>
                </div>
                {brandVoice && (
                  <p className="text-xs text-gray-500">
                    Crisp, direct, confident, non-spammy
                  </p>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleRewrite}
                disabled={loading || !body.trim()}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Variants...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Variants (3)
                  </>
                )}
              </Button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  Warnings
                </p>
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Variants Display */}
            {variants && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Choose a Variant
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(["A", "B", "C"] as const).map((key) => (
                    <div
                      key={key}
                      className={`border-2 rounded-lg p-4 transition-all ${
                        selectedVariant === key
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">
                          Variant {key}
                        </h4>
                        {selectedVariant === key && (
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div className="mb-4">
                        <textarea
                          readOnly
                          value={variants[key]}
                          className="w-full h-48 p-3 border border-gray-300 rounded-md text-sm font-mono bg-white resize-none"
                          onClick={() => setSelectedVariant(key)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUseVariant(key)}
                          className="flex-1"
                          variant={selectedVariant === key ? "default" : "outline"}
                        >
                          Use Variant
                        </Button>
                        {onInsertAsVariant && (
                          <Button
                            size="sm"
                            onClick={() => handleInsertAsVariant(key)}
                            variant="outline"
                          >
                            Insert as Variant
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

