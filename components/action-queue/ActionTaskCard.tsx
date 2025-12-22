// Block 22112 — Action Queue v2
// ActionTaskCard: Displays a single task card with priority badge and action buttons

"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { 
  Phone, 
  Mail, 
  FileText, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2,
  X,
  ArrowRight,
  Clock,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { JobHealthBadge } from "@/components/JobHealthBadge";

interface ActionTaskCardProps {
  task: {
    id: string;
    lead_id: string;
    task_type: string;
    action_priority: number;
    action_category: string;
    next_action?: string;
    next_action_reason?: string;
    ai_message_draft?: string;
    due_at?: string;
    is_overdue?: boolean;
    hours_until_due?: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    job_health_score?: number;
    job_health_trend?: string;
    momentum_score?: number;
    job_probability?: number;
    risk_category?: string;
    is_in_save_mode?: boolean;
    save_severity?: string;
    pipeline_stage?: string;
  };
  onComplete?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  onOpenJob?: (leadId: string) => void;
  onSendMessage?: (leadId: string, taskId: string) => void;
}

// Task type labels
const TASK_TYPE_LABELS: Record<string, string> = {
  call_homeowner: "Call Homeowner",
  call_now: "🔥 CALL THIS HOMEOWNER NOW", // Block 22179 — Hot Lead Detector
  follow_up_hot: "Hot Follow-Up",
  follow_up_warm: "Follow-Up",
  soft_reengagement: "Re-engage",
  tone_reset: "Tone Reset",
  photo_request: "Request Photos",
  insurance_questions: "Insurance Questions",
  timeline_questions: "Timeline Questions",
  homeowner_reply_needed: "Reply Needed",
  send_proposal: "Send Proposal",
  resend_proposal: "Resend Proposal",
  explain_proposal: "Explain Proposal",
  update_proposal: "Update Proposal",
  proposal_overdue: "Proposal Overdue",
  schedule_inspection: "Schedule Inspection",
  confirm_inspection: "Confirm Inspection",
  upload_inspection_report: "Upload Report",
  save_critical_risk_job: "Save Job",
  job_save: "Job Save Required",
  urgent_recovery_message: "Recovery Message",
  call_required: "Call Required",
  next_best_action: "Next Best Action",
  ai_message_draft: "AI Message",
  coaching_prompt: "Coaching",
  move_job_to_next_stage: "Advance Stage",
  complete_inspection: "Complete Inspection",
  confirm_finished_work: "Confirm Work",
  overdue_follow_up: "Overdue Follow-Up",
  reminder_trigger: "Reminder",
  no_reply_48h: "No Reply 48h",
};

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  communication: <Mail className="h-4 w-4" />,
  proposal: <FileText className="h-4 w-4" />,
  inspection: <Calendar className="h-4 w-4" />,
  save: <AlertTriangle className="h-4 w-4" />,
  ai: <Zap className="h-4 w-4" />,
  stage: <ArrowRight className="h-4 w-4" />,
  time: <Clock className="h-4 w-4" />,
};

// Priority styling
const PRIORITY_STYLES = {
  1: {
    border: "border-red-500 border-2",
    badge: "bg-red-600 text-white",
    label: "🔥 Revenue Urgent",
    bg: "bg-red-50 dark:bg-red-950/20",
  },
  2: {
    border: "border-yellow-500 border-2",
    badge: "bg-yellow-600 text-white",
    label: "🎯 Move Forward",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
  },
  3: {
    border: "border-green-500 border-2",
    badge: "bg-green-600 text-white",
    label: "🟢 Clean Up",
    bg: "bg-green-50 dark:bg-green-950/20",
  },
};

export function ActionTaskCard({
  task,
  onComplete,
  onSkip,
  onOpenJob,
  onSendMessage,
}: ActionTaskCardProps) {
  const priorityStyle = PRIORITY_STYLES[task.action_priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES[3];
  const taskLabel = TASK_TYPE_LABELS[task.task_type] || task.task_type;
  const categoryIcon = CATEGORY_ICONS[task.action_category] || <Mail className="h-4 w-4" />;
  
  // Block 22179 — Hot Lead: call_now tasks get special styling
  const isHotLeadCall = task.task_type === "call_now";
  const hotLeadStyle = isHotLeadCall
    ? {
        border: "border-orange-500 border-2 shadow-lg shadow-orange-500/50",
        badge: "bg-orange-600 text-white animate-pulse",
        bg: "bg-orange-50 dark:bg-orange-950/30",
      }
    : null;
  
  const homeownerName = task.first_name || task.last_name
    ? `${task.first_name || ""} ${task.last_name || ""}`.trim()
    : task.email || "Unknown";

  const handleComplete = () => {
    if (onComplete) {
      onComplete(task.id);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip(task.id);
    }
  };

  const handleOpenJob = () => {
    if (onOpenJob) {
      onOpenJob(task.lead_id);
    }
  };

  const handleSendMessage = () => {
    if (onSendMessage) {
      onSendMessage(task.lead_id, task.id);
    }
  };

  return (
    <Card className={cn(
      "transition-all hover:shadow-lg",
      hotLeadStyle?.border || priorityStyle.border,
      hotLeadStyle?.bg || priorityStyle.bg
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className={cn("p-1.5 rounded", hotLeadStyle?.bg || priorityStyle.bg)}>
              {categoryIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn(
                  "text-xs",
                  hotLeadStyle?.badge || priorityStyle.badge
                )}>
                  {isHotLeadCall ? "🔥 HOT LEAD" : priorityStyle.label}
                </Badge>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  isHotLeadCall && "border-orange-500 text-orange-700 font-semibold"
                )}>
                  {taskLabel}
                </Badge>
                {task.is_in_save_mode && (
                  <Badge variant="destructive" className="text-xs">
                    🔥 Save Mode
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-sm mt-1.5 truncate">
                {homeownerName}
              </h3>
            </div>
          </div>
          {task.is_overdue && (
            <Badge variant="destructive" className="text-xs">
              Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        {/* Reason */}
        {task.next_action_reason && (
          <p className="text-sm text-muted-foreground">
            {task.next_action_reason}
          </p>
        )}

        {/* Intelligence Scores */}
        <div className="flex items-center gap-3 flex-wrap">
          {task.job_health_score !== null && task.job_health_score !== undefined && (
            <JobHealthBadge 
              score={task.job_health_score} 
              trend={task.job_health_trend as any}
              variant="compact"
            />
          )}
          {task.job_probability !== null && task.job_probability !== undefined && (
            <Badge variant="outline" className="text-xs">
              {Math.round(task.job_probability)}% Probability
            </Badge>
          )}
          {task.risk_category && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                task.risk_category === "critical" || task.risk_category === "high"
                  ? "border-red-500 text-red-700"
                  : ""
              )}
            >
              Risk: {task.risk_category}
            </Badge>
          )}
        </div>

        {/* Due time */}
        {task.due_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {task.is_overdue
                ? `Overdue by ${task.hours_until_due ? Math.abs(Math.round(task.hours_until_due)) : "?"} hours`
                : task.hours_until_due
                ? `Due in ${Math.round(task.hours_until_due)} hours`
                : "Due soon"}
            </span>
          </div>
        )}

        {/* Pipeline stage */}
        {task.pipeline_stage && (
          <div className="text-xs text-muted-foreground">
            Stage: <span className="font-medium">{task.pipeline_stage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenJob}
            className="flex-1"
          >
            <ArrowRight className="h-3 w-3 mr-1" />
            Open Job
          </Button>
          
          {task.next_action && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSendMessage}
              className="flex-1"
            >
              {task.next_action === "call_now" || task.task_type === "call_now" || task.task_type === "call_homeowner" ? (
                <>
                  <Phone className="h-3 w-3 mr-1" />
                  {isHotLeadCall ? "Call NOW" : "Call"}
                </>
              ) : (
                <>
                  <Mail className="h-3 w-3 mr-1" />
                  Send Message
                </>
              )}
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleComplete}
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

