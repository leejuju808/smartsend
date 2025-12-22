"use client";

import { GripVertical, Mail, Clock, GitBranch, Edit2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export type StepType = "email" | "wait" | "condition";

export interface CampaignStep {
  id?: string;
  step_order: number;
  type: StepType;
  subject?: string | null;
  body?: string | null;
  delay_hours: number;
  enabled: boolean;
  personalization_flags?: Record<string, boolean>;
  conditions?: Record<string, any>;
}

interface StepCardProps {
  step: CampaignStep;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
}

export function StepCard({ step, isSelected, onClick, onEdit }: StepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id || `step-${step.step_order}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getStepIcon = () => {
    switch (step.type) {
      case "email":
        return <Mail className="w-4 h-4" />;
      case "wait":
        return <Clock className="w-4 h-4" />;
      case "condition":
        return <GitBranch className="w-4 h-4" />;
    }
  };

  const getStepLabel = () => {
    switch (step.type) {
      case "email":
        return "Email";
      case "wait":
        return `Wait ${formatDelay(step.delay_hours)}`;
      case "condition":
        return "Condition";
    }
  };

  const formatDelay = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const hasPersonalization = step.personalization_flags && 
    Object.values(step.personalization_flags).some(Boolean);

  const hasConditions = step.conditions && 
    Object.keys(step.conditions).length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border-2 bg-white p-4 transition-all",
        isSelected
          ? "border-blue-500 shadow-md"
          : "border-gray-200 hover:border-gray-300",
        !step.enabled && "opacity-60"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 mt-1"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Step Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              {getStepIcon()}
              <span>Step {step.step_order}</span>
              <span className="text-gray-500 font-normal">— {getStepLabel()}</span>
            </div>
            {!step.enabled && (
              <span className="text-xs text-gray-400">(Disabled)</span>
            )}
          </div>

          {step.type === "email" && (
            <>
              {step.subject && (
                <div className="text-sm font-medium text-gray-900 mb-1 truncate">
                  {step.subject}
                </div>
              )}
              {step.body && (
                <div className="text-xs text-gray-600 line-clamp-2 mb-2">
                  {step.body.replace(/<[^>]*>/g, "").substring(0, 100)}
                  {step.body.length > 100 && "..."}
                </div>
              )}
            </>
          )}

          {/* Icons for personalization and conditions */}
          <div className="flex items-center gap-2 mt-2">
            {hasPersonalization && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Personalization
              </span>
            )}
            {hasConditions && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                Conditions
              </span>
            )}
            {step.type === "email" && step.delay_hours > 0 && (
              <span className="text-xs text-gray-500">
                Delay: {formatDelay(step.delay_hours)}
              </span>
            )}
          </div>
        </div>

        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
            aria-label="Edit step"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}





















































