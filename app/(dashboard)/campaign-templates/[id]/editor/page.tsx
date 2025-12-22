"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Shield, MapPin } from "lucide-react";
import { toast } from "sonner";

type TemplateStep = {
  id: string;
  step_order: number;
  subject_template: string;
  body_template: string;
  delay_days: number;
  tone: string;
};

type CampaignTemplate = {
  id: string;
  name: string;
  description: string | null;
  steps: TemplateStep[];
};

type Persona = {
  id: string;
  name: string;
  description: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [selectedStep, setSelectedStep] = useState<number>(0);
  const [rewriteMode, setRewriteMode] = useState<string>("default");
  const [isRewriting, setIsRewriting] = useState(false);
  const [editedSteps, setEditedSteps] = useState<Record<number, { subject: string; body: string }>>({});
  const [spamScore, setSpamScore] = useState<{ score: number; issues: string[] } | null>(null);
  const [enableLocalPersonalization, setEnableLocalPersonalization] = useState(true);

  // Fetch template
  const { data: templateData, error: templateError } = useSWR<{ template: CampaignTemplate }>(
    templateId ? `/api/campaign-templates/${templateId}` : null,
    fetcher
  );

  // Fetch personas
  const { data: personasData } = useSWR<{ personas: Persona[] }>(
    "/api/campaign-templates/personas",
    fetcher
  );

  const template = templateData?.template;
  const personas = personasData?.personas || [];
  const currentStep = template?.steps[selectedStep];

  // Initialize edited steps
  useEffect(() => {
    if (template?.steps) {
      const initial: Record<number, { subject: string; body: string }> = {};
      template.steps.forEach((step) => {
        initial[step.step_order] = {
          subject: step.subject_template,
          body: step.body_template,
        };
      });
      setEditedSteps(initial);
    }
  }, [template]);

  const handleRewrite = async () => {
    if (!currentStep || !selectedPersona) {
      toast.error("Please select a persona first");
      return;
    }

    setIsRewriting(true);
    try {
      const response = await fetch("/api/campaign-templates/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editedSteps[currentStep.step_order]?.subject || currentStep.subject_template,
          body: editedSteps[currentStep.step_order]?.body || currentStep.body_template,
          personaId: selectedPersona,
          rewriteMode,
          personalizationData: {
            first_name: "{{first_name}}",
            neighborhood: "{{neighborhood}}",
            city: "{{city}}",
          },
        }),
      });

      if (!response.ok) throw new Error("Rewrite failed");

      const data = await response.json();
      if (data.success && data.rewritten) {
        setEditedSteps((prev) => ({
          ...prev,
          [currentStep.step_order]: {
            subject: data.rewritten.subject,
            body: data.rewritten.body,
          },
        }));
        setSpamScore({
          score: data.rewritten.spam_score || 0,
          issues: data.rewritten.spam_issues || [],
        });
        toast.success("Email rewritten successfully!");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to rewrite email");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleSaveToCampaign = async () => {
    // TODO: Implement save to campaign
    toast.info("Save to campaign feature coming soon");
  };

  if (templateError) {
    return (
      <div className="p-6">
        <div className="text-red-500">Failed to load template</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{template.name}</h1>
          {template.description && (
            <p className="text-muted-foreground mt-2">{template.description}</p>
          )}
        </div>
        <Button onClick={handleSaveToCampaign}>Save to Campaign</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Steps List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Email Steps</CardTitle>
              <CardDescription>{template.steps.length} steps in this campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {template.steps.map((step) => (
                <Button
                  key={step.id}
                  variant={selectedStep === step.step_order - 1 ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedStep(step.step_order - 1)}
                >
                  <div className="text-left">
                    <div className="font-medium">Step {step.step_order}</div>
                    <div className="text-xs text-muted-foreground">
                      {step.delay_days === 0 ? "Initial" : `Day ${step.delay_days}`}
                    </div>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Persona Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Persona
              </CardTitle>
              <CardDescription>
                Choose a persona to rewrite this email in that voice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Persona</Label>
                <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={persona.id}>
                        <div>
                          <div className="font-medium">{persona.name}</div>
                          {persona.description && (
                            <div className="text-xs text-muted-foreground">
                              {persona.description}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Rewrite Mode</Label>
                <Select value={rewriteMode} onValueChange={setRewriteMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Improve)</SelectItem>
                    <SelectItem value="shorter">Shorter</SelectItem>
                    <SelectItem value="longer">Longer</SelectItem>
                    <SelectItem value="friendlier">Friendlier</SelectItem>
                    <SelectItem value="more_direct">More Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleRewrite}
                disabled={!selectedPersona || isRewriting}
                className="w-full"
              >
                {isRewriting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rewriting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Rewrite Email
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Email Editor */}
          {currentStep && (
            <Card>
              <CardHeader>
                <CardTitle>Step {currentStep.step_order}</CardTitle>
                <CardDescription>
                  {currentStep.delay_days === 0 ? "Initial email" : `Follow-up on day ${currentStep.delay_days}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Subject</Label>
                  <Input
                    value={editedSteps[currentStep.step_order]?.subject || currentStep.subject_template}
                    onChange={(e) =>
                      setEditedSteps((prev) => ({
                        ...prev,
                        [currentStep.step_order]: {
                          ...prev[currentStep.step_order],
                          subject: e.target.value,
                        },
                      }))
                    }
                    placeholder="Email subject..."
                  />
                </div>

                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={editedSteps[currentStep.step_order]?.body || currentStep.body_template}
                    onChange={(e) =>
                      setEditedSteps((prev) => ({
                        ...prev,
                        [currentStep.step_order]: {
                          ...prev[currentStep.step_order],
                          body: e.target.value,
                        },
                      }))
                    }
                    placeholder="Email body..."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>

                {/* Spam Score */}
                {spamScore && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Shield className="h-4 w-4" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        Spam Score: {(spamScore.score * 100).toFixed(0)}%
                      </div>
                      {spamScore.issues.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Issues: {spamScore.issues.join(", ")}
                        </div>
                      )}
                    </div>
                    {spamScore.score > 0.6 && (
                      <Badge variant="destructive">High Risk</Badge>
                    )}
                    {spamScore.score <= 0.6 && spamScore.score > 0.3 && (
                      <Badge variant="warning">Medium Risk</Badge>
                    )}
                    {spamScore.score <= 0.3 && (
                      <Badge variant="success">Low Risk</Badge>
                    )}
                  </div>
                )}

                {/* Local Personalization Toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="local-personalization"
                    checked={enableLocalPersonalization}
                    onChange={(e) => setEnableLocalPersonalization(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="local-personalization" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Enable Local Personalization
                  </Label>
                </div>
                {enableLocalPersonalization && (
                  <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
                    Will automatically insert: neighborhood, city, street, weather, storm history, local landmarks
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}



























