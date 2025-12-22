"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Download } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TemplateStep {
  id: string;
  step_number: number;
  delay_hours: number;
  subject: string | null;
  body: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  persona: string | null;
  created_at: string;
  steps: TemplateStep[];
}

interface TemplatesResponse {
  templates: Template[];
}

function formatDelayHours(hours: number): string {
  if (hours === 0) return "Immediate";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function TemplatePreviewModal({
  template,
  open,
  onOpenChange,
}: {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {template.steps.map((step, idx) => (
            <Card key={step.id} className="border-l-4 border-l-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Step {step.step_number}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {idx === 0
                      ? "Immediate"
                      : `+${formatDelayHours(step.delay_hours)} after Step ${step.step_number - 1}`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Subject:</p>
                  <p className="text-sm">{step.subject || "(No subject)"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Body:</p>
                  <p className="text-sm whitespace-pre-wrap">{step.body || "(No body)"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<TemplatesResponse>(
    "/api/templates/sequences",
    fetcher
  );

  const handlePreview = (template: Template) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const handleImport = async (templateId: string) => {
    // Prompt for campaign selection or create new
    const campaignId = prompt("Enter campaign ID to import into:");
    if (!campaignId) return;

    setImporting(templateId);
    try {
      const res = await fetch("/api/templates/sequences/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, campaign_id: campaignId }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || "Failed to import"}`);
        return;
      }

      alert(`Successfully imported ${json.imported_steps} steps!`);
      router.push(`/campaigns/${campaignId}/steps`);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setImporting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-6">Sequence Templates Library</h1>
        <p>Loading templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-6">Sequence Templates Library</h1>
        <p className="text-destructive">Error loading templates: {error.message}</p>
      </div>
    );
  }

  const templates = data?.templates || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sequence Templates Library</h1>
        <p className="text-muted-foreground">
          Pick a multi-step outreach bundle and import it to your campaign with one click.
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No templates available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="border p-6 rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {template.persona && (
                    <span className="inline-block text-xs px-2 py-1 bg-secondary rounded">
                      {template.persona}
                    </span>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {template.steps.length} step{template.steps.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreview(template)}
                  className="flex-1"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Steps
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleImport(template.id)}
                  disabled={importing === template.id}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {importing === template.id ? "Importing..." : "Import to Campaign"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <TemplatePreviewModal
        template={previewTemplate}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
