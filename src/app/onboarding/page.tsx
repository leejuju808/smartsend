"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CheckCircle2, Circle, Mail, Users, MessageSquare, FileText, Filter, Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

const steps = [
  // BLOCK 281000 — Onboarding copy hardened for revenue (no AI/system jargon)
  { id: "workspace", title: "Set up your company" },
  { id: "email_connect", title: "Connect the inbox you send from" },
  { id: "import_leads", title: "Import homeowners / leads" },
  { id: "create_segment", title: "Create your follow-up list" },
  { id: "create_smartlist", title: "Choose your hot leads list" },
  { id: "create_campaign", title: "Send your first follow-ups" },
  { id: "review", title: "Review & start booking jobs" },
];

type StepId = typeof steps[number]["id"] | "start" | "complete";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [currentStep, setCurrentStep] = useState<StepId>("start");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [meta, setMeta] = useState<any>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      
      // Load current onboarding state
      const res = await fetch("/api/onboarding/step");
      if (res.ok) {
        const data = await res.json();
        setCurrentStep(data.step || "start");
        setMeta(data.meta || {});
        if (data.meta?.workspaceName) {
          setWorkspaceName(data.meta.workspaceName);
        }
      }
    })();
  }, []);

  const updateStep = async (step: StepId, stepMeta?: any) => {
    setLoading(true);
    try {
      const newMeta = { ...meta, ...stepMeta };
      setMeta(newMeta);
      
      const res = await fetch("/api/onboarding/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, meta: newMeta }),
      });

      if (res.ok) {
        setCurrentStep(step);
      }
    } catch (error) {
      console.error("Error updating step:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStepIndex = (step: StepId): number => {
    if (step === "start") return -1;
    if (step === "complete") return steps.length;
    return steps.findIndex((s) => s.id === step);
  };

  const currentStepIndex = getStepIndex(currentStep);
  const activeStepIndex = Math.max(0, currentStepIndex);

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      const nextId = steps[currentStepIndex + 1].id;
      updateStep(nextId);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      const prevId = steps[currentStepIndex - 1].id;
      updateStep(prevId);
    }
  };

  const skipStep = () => {
    nextStep();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-4">Welcome to SmartSend</h1>
          <p className="text-muted-foreground">
            Get set up to send faster and follow up automatically — so more homeowners say yes.
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = index === activeStepIndex;
              const isCompleted = index < activeStepIndex;
              const stepId = step.id as StepId;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => {
                        if (isCompleted || isActive) {
                          updateStep(stepId);
                        }
                      }}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                        isActive
                          ? "bg-indigo-600 text-white scale-110"
                          : isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </button>
                    <span
                      className={`text-xs mt-2 text-center ${
                        isActive ? "font-semibold text-indigo-600" : "text-gray-500"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 transition-all ${
                        isCompleted ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            {currentStep === "workspace" && (
              <WorkspaceStep
                workspaceName={workspaceName}
                onNameChange={setWorkspaceName}
                onContinue={async () => {
                  const res = await fetch("/api/workspaces/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: workspaceName || "My Workspace" }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    // Generate defaults after workspace creation
                    await fetch("/api/onboarding/generate-defaults", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        workspaceId: data.id,
                        accountId: userId,
                      }),
                    });
                    await updateStep("email_connect", {
                      workspaceId: data.id,
                      workspaceName: workspaceName || "My Workspace",
                    });
                  }
                }}
              />
            )}

            {currentStep === "email_connect" && (
              <EmailConnectStep
                onConnected={async () => {
                  await updateStep("import_leads");
                }}
              />
            )}

            {currentStep === "import_leads" && (
              <ImportLeadsStep
                workspaceId={meta.workspaceId}
                onImported={async () => {
                  await updateStep("create_segment");
                }}
              />
            )}

            {currentStep === "create_segment" && (
              <CreateSegmentStep
                workspaceId={meta.workspaceId}
                onCreated={async (segmentId) => {
                  await updateStep("create_smartlist", { segmentId });
                }}
              />
            )}

            {currentStep === "create_smartlist" && (
              <CreateSmartListStep
                workspaceId={meta.workspaceId}
                onCreated={async (smartlistId) => {
                  await updateStep("create_campaign", { smartlistId });
                }}
              />
            )}

            {currentStep === "create_campaign" && (
              <CreateCampaignStep
                workspaceId={meta.workspaceId}
                segmentId={meta.segmentId}
                smartlistId={meta.smartlistId}
                onCreated={async (campaignId) => {
                  await updateStep("review", { campaignId });
                }}
              />
            )}

            {currentStep === "review" && (
              <ReviewStep
                onComplete={async () => {
                  // Ensure defaults are generated before completing
                  if (meta.workspaceId) {
                    await fetch("/api/onboarding/generate-defaults", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        workspaceId: meta.workspaceId,
                        accountId: userId,
                      }),
                    });
                  }
                  await updateStep("complete");
                  router.push("/dashboard");
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <div>
            {currentStepIndex > 0 && (
              <Button variant="outline" onClick={prevStep} disabled={loading}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={skipStep} disabled={loading}>
              Skip
            </Button>
            {currentStep !== "review" && currentStep !== "complete" && (
              <Button onClick={nextStep} disabled={loading}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step Components
function WorkspaceStep({
  workspaceName,
  onNameChange,
  onContinue,
}: {
  workspaceName: string;
  onNameChange: (name: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Users className="text-indigo-600" size={20} />
        </div>
        <h3 className="text-xl font-semibold">Create Workspace</h3>
      </div>
      <p className="text-muted-foreground">
        This is the name that appears on estimates and follow-ups. You can change it later.
      </p>
      <Input
        placeholder="Workspace name"
        value={workspaceName}
        onChange={(e) => onNameChange(e.target.value)}
        className="max-w-md"
      />
      <Button onClick={onContinue} className="mt-4">
        Continue
      </Button>
    </div>
  );
}

function EmailConnectStep({ onConnected }: { onConnected: () => void }) {
  const connectGmail = () => {
    window.location.href = "/api/connect/gmail";
  };

  const connectOutlook = () => {
    // Use the OAuth start route for Outlook
    window.location.href = "/api/oauth/outlook/start";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Mail className="w-8 h-8 text-indigo-600" />
        <h3 className="text-xl font-semibold">Connect Your Email</h3>
      </div>
      <p className="text-muted-foreground">
        Connect the inbox you send from so SmartSend can send estimates and follow-ups for you.
      </p>
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <button
          onClick={connectGmail}
          className="p-6 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Mail className="text-red-600" size={20} />
            </div>
            <span className="font-semibold">Gmail</span>
          </div>
          <p className="text-sm text-gray-600">Connect with Google OAuth</p>
        </button>
        <button
          onClick={connectOutlook}
          className="p-6 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail className="text-blue-600" size={20} />
            </div>
            <span className="font-semibold">Outlook</span>
          </div>
          <p className="text-sm text-gray-600">Connect with Microsoft</p>
        </button>
      </div>
      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          Once connected, return here to continue setup.
        </p>
      </div>
    </div>
  );
}

function ImportLeadsStep({
  workspaceId,
  onImported,
}: {
  workspaceId?: string;
  onImported: () => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="w-8 h-8 text-indigo-600" />
        <h3 className="text-xl font-semibold">Import Your Leads</h3>
      </div>
      <p className="text-muted-foreground">
        Import your homeowner list so you can send estimates fast and follow up without dropping the ball.
      </p>
      <div className="mt-6 p-6 border-2 border-dashed border-gray-300 rounded-xl text-center">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">
          Upload a CSV to import your contacts
        </p>
        <Button
          onClick={() => {
            router.push("/leads/import");
            // Note: In a real implementation, you'd want to detect when import completes
            // and call onImported() automatically
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          Import Leads Now
        </Button>
      </div>
      <div className="mt-4 p-4 bg-amber-50 rounded-lg">
        <p className="text-sm text-amber-800">
          📊 Your CSV should include: email, first_name, last_name, company
        </p>
      </div>
    </div>
  );
}

function CreateSegmentStep({
  workspaceId,
  onCreated,
}: {
  workspaceId?: string;
  onCreated: (segmentId: string) => void;
}) {
  const [name, setName] = useState("All Leads");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      // Auto-create "All Leads" segment
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definition: { op: "and", rules: [] }, // Empty rules = all leads
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.id || "default-segment-id");
      }
    } catch (error) {
      console.error("Error creating segment:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-8 h-8 text-indigo-600" />
        <h3 className="text-xl font-semibold">Create Your First Segment</h3>
      </div>
      <p className="text-muted-foreground">
        Lists keep your follow-up simple. We’ll start you with an “All Leads” list you can refine later.
      </p>
      <div className="mt-4">
        <Input
          placeholder="Segment name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-md"
        />
        <Button onClick={handleCreate} disabled={loading} className="mt-4">
          {loading ? "Creating..." : "Create Segment"}
        </Button>
      </div>
    </div>
  );
}

function CreateSmartListStep({
  workspaceId,
  onCreated,
}: {
  workspaceId?: string;
  onCreated: (smartlistId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const smartLists = [
    { id: "hot-leads", name: "Hot Leads", prompt: "Leads showing the strongest buying signals" },
    { id: "positive-tone", name: "Positive Replies", prompt: "People who responded positively (move them forward fast)" },
    { id: "meeting-intent", name: "Appointment Interest", prompt: "People asking for a time to talk or schedule" },
  ];

  const handleCreate = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const selectedList = smartLists.find((l) => l.id === selected);
      const res = await fetch("/api/smartlists/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedList?.name,
          prompt: selectedList?.prompt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.id || "default-smartlist-id");
      }
    } catch (error) {
      console.error("Error creating SmartList:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="w-8 h-8 text-indigo-600" />
        <h3 className="text-xl font-semibold">Build a SmartList</h3>
      </div>
      <p className="text-muted-foreground">
        This keeps your hottest leads at the top so you can close faster. Pick one to start:
      </p>
      <div className="mt-4 space-y-2">
        {smartLists.map((list) => (
          <button
            key={list.id}
            onClick={() => setSelected(list.id)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              selected === list.id
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-semibold">{list.name}</div>
            <div className="text-sm text-gray-600 mt-1">{list.prompt}</div>
          </button>
        ))}
      </div>
      <Button onClick={handleCreate} disabled={!selected || loading} className="mt-4">
        {loading ? "Creating..." : "Create SmartList"}
      </Button>
    </div>
  );
}

function CreateCampaignStep({
  workspaceId,
  segmentId,
  smartlistId,
  onCreated,
}: {
  workspaceId?: string;
  segmentId?: string;
  smartlistId?: string;
  onCreated: (campaignId: string) => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare className="w-8 h-8 text-indigo-600" />
        <h3 className="text-xl font-semibold">Launch Your First Campaign</h3>
      </div>
      <p className="text-muted-foreground">
        Create your first campaign with pre-filled templates and settings.
      </p>
      <div className="mt-6 p-6 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
        <h3 className="font-semibold text-indigo-900 mb-3">🚀 Ready to launch!</h3>
        <p className="text-indigo-800 mb-4">
          Click below to open the campaign builder with pre-filled settings.
        </p>
        <Button
          onClick={() => {
            router.push("/campaigns/new");
            // Note: In a real implementation, you'd want to detect when campaign is created
            // and call onCreated() automatically
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          Open Campaign Builder
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
        <h3 className="text-xl font-semibold">Review Your Setup</h3>
      </div>
      <p className="text-muted-foreground mb-6">
        You're all set! Here's what you've accomplished:
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Workspace created</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Email account connected</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Leads imported</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Segment created</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>SmartList configured</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Campaign ready</span>
        </div>
      </div>
      <Button onClick={onComplete} className="mt-6 w-full">
        Complete Setup & Go to Dashboard
      </Button>
    </div>
  );
}

