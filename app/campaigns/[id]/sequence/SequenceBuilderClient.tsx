"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { StepCard } from "@/components/campaigns/v2/sequence/StepCard";
import { StepEditor } from "@/components/campaigns/v2/sequence/StepEditor";
import { StepSidebar } from "@/components/campaigns/v2/sequence/StepSidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Play, Pause } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_type: "email" | "delay" | "condition" | "tag";
  step_order: number;
  config: {
    subject?: string;
    body?: string;
    duration?: number;
    unit?: "hours" | "days" | "weeks";
    condition?: string;
    action?: string;
    target?: string;
    label?: string;
  };
  created_at?: string;
  updated_at?: string;
}

interface SequenceBuilderClientProps {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  initialSteps: CampaignStep[];
  planKey: string;
}

export function SequenceBuilderClient({
  campaignId,
  campaignName,
  campaignStatus,
  initialSteps,
  planKey,
}: SequenceBuilderClientProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<CampaignStep[]>(initialSteps);
  const [selectedStep, setSelectedStep] = useState<CampaignStep | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Auto-save every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (steps.length > 0) {
        saveSteps();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [steps]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
    const oldIndex = sortedSteps.findIndex((s) => s.id === active.id);
    const newIndex = sortedSteps.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newSteps = arrayMove(sortedSteps, oldIndex, newIndex);
    const reorderedSteps = newSteps.map((step, index) => ({
      ...step,
      step_order: index,
    }));

    setSteps(reorderedSteps);

    // Save reorder to backend
    try {
      const stepIds = reorderedSteps.map((s) => s.id);
      const response = await fetch(`/api/campaigns/${campaignId}/steps/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_ids: stepIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to reorder steps");
      }
    } catch (error) {
      console.error("Failed to reorder steps:", error);
      toast.error("Failed to save step order");
    }
  };

  const handleAddStep = async (stepType: "email" | "delay" | "condition" | "tag") => {
    // Check feature gating for conditions
    if (stepType === "condition" && planKey === "starter") {
      toast.error("Conditions are available in Growth and Domination plans");
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_type: stepType,
          config: getDefaultConfig(stepType),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create step");
      }

      const { step } = await response.json();
      setSteps([...steps, step]);
      setSelectedStep(step);
      setShowSidebar(false);
      toast.success("Step added");
    } catch (error) {
      console.error("Failed to add step:", error);
      toast.error("Failed to add step");
    }
  };

  const handleUpdateStep = async (updatedStep: CampaignStep) => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/steps/${updatedStep.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: updatedStep.config,
            step_type: updatedStep.step_type,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update step");
      }

      const { step } = await response.json();
      setSteps(steps.map((s) => (s.id === step.id ? step : s)));
      setSelectedStep(step);
      toast.success("Step updated");
    } catch (error) {
      console.error("Failed to update step:", error);
      toast.error("Failed to update step");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/steps/${stepId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete step");
      }

      setSteps(steps.filter((s) => s.id !== stepId));
      if (selectedStep?.id === stepId) {
        setSelectedStep(null);
      }
      toast.success("Step deleted");
    } catch (error) {
      console.error("Failed to delete step:", error);
      toast.error("Failed to delete step");
    }
  };

  const saveSteps = async () => {
    // Steps are auto-saved via individual API calls
    // This is just a placeholder for manual save if needed
  };

  const handlePublish = async () => {
    if (steps.length === 0) {
      toast.error("Add at least one step before publishing");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/publish`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.error === "upgrade_required") {
          toast.error(error.message);
          // Could redirect to upgrade page here
          return;
        }
        throw new Error(error.message || "Failed to publish");
      }

      toast.success("Campaign published!");
      router.refresh();
    } catch (error: any) {
      console.error("Failed to publish:", error);
      toast.error(error.message || "Failed to publish campaign");
    } finally {
      setIsSaving(false);
    }
  };

  const getDefaultConfig = (stepType: string) => {
    switch (stepType) {
      case "email":
        return {
          subject: "{{ai_subject}}",
          body: "{{ai_body}}",
        };
      case "delay":
        return {
          duration: 2,
          unit: "days",
        };
      case "condition":
        return {
          condition: "replied",
          action: "stop",
        };
      case "tag":
        return {
          label: "Not Interested",
        };
      default:
        return {};
    }
  };

  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/campaigns/${campaignId}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{campaignName}</h1>
            <p className="text-xs text-gray-500">Sequence Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaignStatus === "published" ? (
            <Button variant="outline" size="sm" disabled>
              <Pause className="w-4 h-4 mr-2" />
              Published
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              size="sm"
              disabled={isSaving || steps.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              {isSaving ? "Publishing..." : "Publish Sequence"}
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Step Types */}
        <StepSidebar
          onAddStep={handleAddStep}
          planKey={planKey}
          isOpen={showSidebar}
          onClose={() => setShowSidebar(false)}
        />

        {/* Center - Sequence Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedSteps.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {sortedSteps.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
                        <p className="text-sm text-gray-500 mb-2">
                          No steps yet
                        </p>
                        <p className="text-xs text-gray-400 mb-4">
                          Click "Add Step" to start building your sequence
                        </p>
                        <Button
                          onClick={() => setShowSidebar(true)}
                          size="sm"
                          variant="outline"
                        >
                          Add Your First Step
                        </Button>
                      </div>
                    ) : (
                      sortedSteps.map((step) => (
                        <StepCard
                          key={step.id}
                          step={step}
                          isSelected={selectedStep?.id === step.id}
                          onClick={() => setSelectedStep(step)}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>

          {/* Add Step Button */}
          {sortedSteps.length > 0 && (
            <div className="border-t bg-white px-6 py-4">
              <Button
                onClick={() => setShowSidebar(true)}
                variant="outline"
                className="w-full"
              >
                + Add Step
              </Button>
            </div>
          )}
        </div>

        {/* Right Sidebar - Step Editor */}
        <div className="w-96 border-l bg-white overflow-y-auto">
          <StepEditor
            step={selectedStep}
            onSave={handleUpdateStep}
            onDelete={selectedStep ? () => handleDeleteStep(selectedStep.id) : undefined}
            campaignId={campaignId}
            planKey={planKey}
          />
        </div>
      </div>
    </div>
  );
}
















































