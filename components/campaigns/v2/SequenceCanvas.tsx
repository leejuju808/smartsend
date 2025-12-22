"use client";

import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { StepCard, CampaignStep } from "./StepCard";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SequenceCanvasProps {
  steps: CampaignStep[];
  selectedStepId?: string;
  onStepSelect: (step: CampaignStep) => void;
  onStepReorder: (steps: CampaignStep[]) => void;
  onAddStep: () => void;
  onStepEdit?: (step: CampaignStep) => void;
}

export function SequenceCanvas({
  steps,
  selectedStepId,
  onStepSelect,
  onStepReorder,
  onAddStep,
  onStepEdit,
}: SequenceCanvasProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
    const oldIndex = sortedSteps.findIndex(
      (s) => (s.id || `step-${s.step_order}`) === active.id
    );
    const newIndex = sortedSteps.findIndex(
      (s) => (s.id || `step-${s.step_order}`) === over.id
    );

    if (oldIndex === -1 || newIndex === -1) return;

    const newSteps = arrayMove(sortedSteps, oldIndex, newIndex);
    
    // Update step_order for each step
    const reorderedSteps = newSteps.map((step, index) => ({
      ...step,
      step_order: index + 1,
    }));

    onStepReorder(reorderedSteps);
  };

  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Sequence</h2>
        <Button
          onClick={onAddStep}
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Step
        </Button>
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedSteps.map((s) => s.id || `step-${s.step_order}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3 flex-1 overflow-y-auto">
            {sortedSteps.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-sm mb-2">No steps yet</p>
                <p className="text-xs text-gray-400">
                  Click "Add Step" to start building your sequence
                </p>
              </div>
            ) : (
              sortedSteps.map((step) => (
                <StepCard
                  key={step.id || `step-${step.step_order}`}
                  step={step}
                  isSelected={selectedStepId === (step.id || `step-${step.step_order}`)}
                  onClick={() => onStepSelect(step)}
                  onEdit={() => onStepEdit?.(step)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}





















































