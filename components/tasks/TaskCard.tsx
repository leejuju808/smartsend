// Task Card Component - Shows all task information at a glance

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { 
  ExclamationTriangleIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";

type TaskType = "follow_up_needed" | "book_inspection" | "answer_question" | "update_lead_info" | "high_urgency_issue";
type UrgencyLevel = "high" | "normal" | "low";

type Task = {
  id: string;
  task_type: TaskType;
  urgency: UrgencyLevel;
  title: string;
  description: string | null;
  due_at: string;
  metadata: {
    reply_intent?: string;
    storm_risk?: number;
    insurance_likelihood?: number;
    last_message_snippet?: string;
    [key: string]: any;
  };
  contacts?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  pipeline_stages?: {
    id: string;
    key: string;
    label: string;
  } | null;
};

type TaskCardProps = {
  task: Task;
  onComplete?: () => void;
  onClick?: () => void;
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  follow_up_needed: "Follow-Up",
  book_inspection: "Book Inspection",
  answer_question: "Answer Question",
  update_lead_info: "Update Info",
  high_urgency_issue: "Urgent Issue",
};

const URGENCY_CONFIG: Record<UrgencyLevel, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: any;
}> = {
  high: { 
    label: "High", 
    color: "text-red-600", 
    bgColor: "bg-red-100 border-red-300",
    icon: ExclamationTriangleIcon,
  },
  normal: { 
    label: "Normal", 
    color: "text-yellow-600", 
    bgColor: "bg-yellow-100 border-yellow-300",
    icon: CalendarIcon,
  },
  low: { 
    label: "Low", 
    color: "text-blue-600", 
    bgColor: "bg-blue-100 border-blue-300",
    icon: CalendarIcon,
  },
};

export function TaskCard({ task, onComplete, onClick }: TaskCardProps) {
  const urgencyConfig = URGENCY_CONFIG[task.urgency];
  const UrgencyIcon = urgencyConfig.icon;
  const isOverdue = new Date(task.due_at) < new Date() && task.urgency !== "low";
  
  const homeownerName = task.contacts
    ? `${task.contacts.first_name || ""} ${task.contacts.last_name || ""}`.trim() || task.contacts.email
    : "Unknown";

  return (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        isOverdue ? "border-red-400 border-2" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: Urgency & Type */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <UrgencyIcon className={`h-4 w-4 ${urgencyConfig.color}`} />
            <Badge 
              variant="outline" 
              className={`${urgencyConfig.bgColor} ${urgencyConfig.color} border`}
            >
              {urgencyConfig.label}
            </Badge>
          </div>
          <Badge variant="outline" className="text-xs">
            {TASK_TYPE_LABELS[task.task_type]}
          </Badge>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm leading-tight">{task.title}</h3>

        {/* Homeowner Info */}
        {task.contacts && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserIcon className="h-4 w-4" />
            <span className="truncate">{homeownerName}</span>
          </div>
        )}

        {/* Storm Risk Indicator */}
        {task.metadata.storm_risk !== undefined && task.metadata.storm_risk > 0.5 && (
          <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
            <BoltIcon className="h-3 w-3" />
            <span>Storm Risk: {Math.round(task.metadata.storm_risk * 100)}%</span>
          </div>
        )}

        {/* Insurance Indicator */}
        {task.metadata.insurance_likelihood !== undefined && task.metadata.insurance_likelihood > 0.5 && (
          <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
            <BuildingOfficeIcon className="h-3 w-3" />
            <span>Insurance Claim Likely</span>
          </div>
        )}

        {/* Last Message Snippet */}
        {task.metadata.last_message_snippet && (
          <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded border">
            <p className="line-clamp-2">{task.metadata.last_message_snippet}</p>
          </div>
        )}

        {/* Due Date */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            <span>
              {isOverdue ? (
                <span className="text-red-600 font-semibold">Overdue</span>
              ) : (
                formatDistanceToNow(new Date(task.due_at), { addSuffix: true })
              )}
            </span>
          </div>
          {onComplete && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              className="text-xs"
            >
              Complete
            </Button>
          )}
        </div>

        {/* Pipeline Stage */}
        {task.pipeline_stages && (
          <div className="text-xs text-muted-foreground">
            Pipeline: {task.pipeline_stages.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































