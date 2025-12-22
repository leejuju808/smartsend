"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  steps: Array<{
    stepNumber: number;
    subject: string;
    body: string;
    delayDays: number;
  }>;
}

interface Step4ChooseTemplateProps {
  onNext: (data: { templateId: string }) => void;
  onBack: () => void;
  selectedTemplateId?: string;
}

export function Step4ChooseTemplate({ onNext, onBack, selectedTemplateId }: Step4ChooseTemplateProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedTemplateId);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/templates/campaigns");
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      
      // Filter to roofing-specific templates
      const roofingTemplates = (data.templates || []).filter((t: Template) =>
        ["hail", "wind", "insurance", "leak", "general", "nearby", "seasonal", "post-quote", "re-engagement"].includes(t.category)
      );
      
      setTemplates(roofingTemplates.slice(0, 7)); // Show top 7
      
      if (roofingTemplates.length > 0 && !selectedId) {
        setSelectedId(roofingTemplates[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (templateId: string) => {
    try {
      const res = await fetch(`/api/templates/campaigns/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      setPreviewTemplate(data.template);
    } catch (error: any) {
      toast.error("Failed to load preview");
    }
  };

  const handleNext = () => {
    if (!selectedId) {
      toast.error("Please select a template");
      return;
    }
    onNext({ templateId: selectedId });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Choose a Roofing Campaign Template</h2>
        <p className="text-gray-600 mt-2">
          Select a pre-built template designed for roofing companies
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className={`cursor-pointer transition-all ${
              selectedId === template.id ? "ring-2 ring-blue-500" : ""
            }`}
            onClick={() => setSelectedId(template.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{template.title}</CardTitle>
                  <CardDescription className="mt-1">{template.description}</CardDescription>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedId === template.id
                    ? "border-blue-500 bg-blue-500"
                    : "border-gray-300"
                }`}>
                  {selectedId === template.id && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{template.category}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {template.steps.length} steps
                  </span>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p><strong>Goal:</strong> {getTemplateGoal(template.category)}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(template.id);
                  }}
                  className="w-full"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Template
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {previewTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>Template Preview: {previewTemplate.title}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewTemplate(null)}
              className="absolute top-4 right-4"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {previewTemplate.steps.map((step, index) => (
                <div key={index} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge>Step {step.stepNumber}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Delay: {step.delayDays} days
                    </span>
                  </div>
                  <h4 className="font-semibold mb-2">{step.subject}</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {step.body.substring(0, 200)}...
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!selectedId}>
          Next Step
        </Button>
      </div>
    </div>
  );
}

function getTemplateGoal(category: string): string {
  const goals: Record<string, string> = {
    hail: "Book estimate after hail damage",
    wind: "Schedule inspection for wind damage",
    insurance: "Help file insurance claims",
    leak: "Emergency roof leak response",
    general: "General roofing outreach",
    nearby: "Leverage social proof from nearby work",
    seasonal: "Seasonal maintenance check",
    "post-quote": "Follow up after sending quote",
    "re-engagement": "Re-engage non-responsive leads",
  };
  return goals[category] || "Generate leads";
}




























































