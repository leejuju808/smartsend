"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Loader2, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTemplate?: string;
  onUseTemplate: (template: string) => void;
};

type RewriteVersion = {
  tone: string;
  content: string;
};

export default function SmartTemplateRewriter({ 
  open, 
  onClose, 
  initialTemplate = "",
  onUseTemplate 
}: Props) {
  const [template, setTemplate] = useState(initialTemplate);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<RewriteVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Update template when initialTemplate changes
  useEffect(() => {
    if (open) {
      setTemplate(initialTemplate);
      setVersions([]);
      setError(null);
    }
  }, [initialTemplate, open]);

  const handleRewrite = async () => {
    if (!template.trim()) {
      setError("Please enter a template to rewrite");
      return;
    }

    setLoading(true);
    setError(null);
    setVersions([]);

    try {
      const res = await fetch("/api/email/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to rewrite template");
      }

      if (data.versions && Array.isArray(data.versions) && data.versions.length === 3) {
        setVersions(data.versions);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (e: any) {
      setError(e.message || "Failed to rewrite template");
    } finally {
      setLoading(false);
    }
  };

  const handleUseVersion = (content: string) => {
    onUseTemplate(content);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Template Rewriter
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Base Cold Email Template
            </label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Hi {{first_name}},&#10;&#10;I noticed {{company}} is growing fast. We help teams like yours book 3-5 extra demos per week. Would you be open to a quick 10-minute call?&#10;&#10;Best,&#10;{{sender_name}}"
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Placeholders like <code>{`{{first_name}}`}</code>, <code>{`{{company}}`}</code> will be preserved.
            </p>
          </div>

          <div className="flex justify-end">
            <Button 
              onClick={handleRewrite} 
              disabled={loading || !template.trim()}
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rewriting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Rewrite with AI
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {versions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">3 AI-Generated Versions</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {versions.map((version, index) => (
                  <div
                    key={index}
                    className="rounded-lg border p-4 space-y-3 bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {version.tone}
                      </span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-h-[200px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                        {version.content}
                      </pre>
                    </div>
                    <Button
                      onClick={() => handleUseVersion(version.content)}
                      size="sm"
                      className="w-full"
                    >
                      Use This
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && versions.length === 0 && (
            <div className="grid md:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4 space-y-3 animate-pulse"
                >
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-32 w-full bg-muted rounded" />
                  <div className="h-9 w-full bg-muted rounded" />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

