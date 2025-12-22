"use client";

import { GripVertical, Mail, Clock, GitBranch, Tag, Edit2, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { CampaignStep } from "@/app/campaigns/[id]/sequence/SequenceBuilderClient";

interface StepCardProps {
  step: CampaignStep;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function StepCard({
  step,
  isSelected,
  onClick,
  onEdit,
  onDelete,
}: StepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getStepIcon = () => {
    switch (step.step_type) {
      case "email":
        return <Mail className="w-4 h-4" />;
      case "delay":
        return <Clock className="w-4 h-4" />;
      case "condition":
        return <GitBranch className="w-4 h-4" />;
      case "tag":
        return <Tag className="w-4 h-4" />;
    }
  };

  const getStepLabel = () => {
    switch (step.step_type) {
      case "email":
        return step.config.subject || "Email";
      case "delay":
        const duration = step.config.duration || 2;
        const unit = step.config.unit || "days";
        return `Wait ${duration} ${unit}`;
      case "condition":
        return step.config.condition
          ? `If ${step.config.condition} → ${step.config.action}`
          : "Condition";
      case "tag":
        return `Tag: ${step.config.label || "Untitled"}`;
    }
  };

  const formatDelay = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border-2 bg-white p-4 transition-all cursor-pointer",
        isSelected
          ? "border-blue-500 shadow-md"
          : "border-gray-200 hover:border-gray-300"
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
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Step Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              {getStepIcon()}
              <span>Step {step.step_order + 1}</span>
              <span className="text-gray-500 font-normal">— {getStepLabel()}</span>
            </div>
          </div>

          {step.step_type === "email" && (
            <>
              {step.config.subject && (
                <div className="text-sm font-medium text-gray-900 mb-1 truncate">
                  {step.config.subject}
                </div>
              )}
              {step.config.body && (
                <div className="text-xs text-gray-600 line-clamp-2 mb-2">
                  {step.config.body.replace(/<[^>]*>/g, "").substring(0, 100)}
                  {step.config.body.length > 100 && "..."}
                </div>
              )}
            </>
          )}

          {step.step_type === "delay" && (
            <div className="text-xs text-gray-600">
              Sequence will wait before proceeding to the next step
            </div>
          )}

          {step.step_type === "condition" && (
            <div className="text-xs text-gray-600">
              {step.config.condition && step.config.action
                ? `If ${step.config.condition}, then ${step.config.action}`
                : "Configure condition logic"}
            </div>
          )}

          {step.step_type === "tag" && (
            <div className="text-xs text-gray-600">
              Apply label: {step.config.label || "Untitled"}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Edit step"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-gray-400 hover:text-red-600 p-1"
              aria-label="Delete step"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
















































