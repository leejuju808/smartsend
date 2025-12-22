"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type Step = {
  id?: string;
  step_no: number;
  enabled: boolean;
  offset_days: number;
  subject_template?: string | null;
  body_html_template?: string | null;
  send_start?: string | null;
  send_end?: string | null;
  sender_mode?: 'single' | 'rotation' | null;
  sender_inbox_id?: string | null;
  rotation_domain_id?: string | null;
  has_variants?: boolean;
  enable_variant?: boolean;
  subject_b?: string | null;
  body_html_template_b?: string | null;
  variant_split?: number;
  followup_enabled?: boolean;
  followup_delay_days?: number;
  followup_condition?: string;
  followup_subject_template?: string | null;
  followup_body_template?: string | null;
  ai_personalization_enabled?: boolean;
  ai_personalization_mode?: 'opener_only';
};

interface SortableStepItemProps {
  step: Step;
  children: React.ReactNode;
}

export default function SortableStepItem({ step, children }: SortableStepItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id || `step-${step.step_no}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 mt-1 p-1 rounded hover:bg-gray-100 transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}



























































