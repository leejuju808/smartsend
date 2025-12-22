/**
 * Job Type Workflow Triggers
 * 
 * Automatically triggers appropriate workflows based on job type classification
 */

import type { JobType } from "@/src/lib/ai/jobTypeClassifier"

export type WorkflowType =
  | "repair_workflow"
  | "replacement_workflow"
  | "insurance_workflow"
  | "storm_workflow"
  | "inspection_workflow"
  | null

export interface WorkflowAction {
  type: string
  payload: Record<string, any>
}

/**
 * Get suggested workflow based on job type
 */
export function getWorkflowForJobType(
  jobType: JobType,
  severityLevel?: "low" | "medium" | "high",
  insuranceVsRetail?: "insurance" | "retail" | "unclear"
): WorkflowType {
  switch (jobType) {
    case "roof_repair":
    case "emergency_leak_repair":
    case "gutter_repair_replacement":
      return "repair_workflow"
    
    case "roof_replacement":
      return "replacement_workflow"
    
    case "insurance_driven_claim":
      return "insurance_workflow"
    
    case "storm_damage":
      return "storm_workflow"
    
    case "inspection_only":
      return "inspection_workflow"
    
    default:
      return null
  }
}

/**
 * Get workflow actions for a job type
 */
export function getWorkflowActions(
  workflowType: WorkflowType,
  threadId: string,
  context?: {
    severityLevel?: "low" | "medium" | "high"
    insuranceVsRetail?: "insurance" | "retail" | "unclear"
    missingInformation?: string[]
  }
): WorkflowAction[] {
  if (!workflowType) return []

  const actions: WorkflowAction[] = []

  switch (workflowType) {
    case "repair_workflow":
      actions.push({
        type: "set_priority",
        payload: { priority: context?.severityLevel === "high" ? "high" : "normal" }
      })
      actions.push({
        type: "suggest_reply_template",
        payload: { template: "repair_quick_response" }
      })
      if (context?.severityLevel === "high") {
        actions.push({
          type: "create_task",
          payload: {
            title: "Emergency repair - respond ASAP",
            due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
            priority: "high"
          }
        })
      }
      break

    case "replacement_workflow":
      actions.push({
        type: "set_pipeline_stage",
        payload: { stage: "estimate_scheduled" }
      })
      actions.push({
        type: "create_task",
        payload: {
          title: "Schedule roof inspection",
          due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          priority: "normal"
        }
      })
      actions.push({
        type: "suggest_reply_template",
        payload: { template: "replacement_inspection_offer" }
      })
      break

    case "insurance_workflow":
      actions.push({
        type: "set_pipeline_stage",
        payload: { stage: "estimate_scheduled" }
      })
      actions.push({
        type: "create_task",
        payload: {
          title: "Document damage for insurance claim",
          due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          priority: "normal"
        }
      })
      if (context?.missingInformation?.includes("photos")) {
        actions.push({
          type: "suggest_reply_template",
          payload: { template: "insurance_photos_request" }
        })
      }
      actions.push({
        type: "add_tag",
        payload: { tag: "insurance-claim" }
      })
      break

    case "storm_workflow":
      actions.push({
        type: "set_priority",
        payload: { priority: "high" }
      })
      actions.push({
        type: "create_task",
        payload: {
          title: "Storm damage assessment - priority response",
          due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
          priority: "high"
        }
      })
      actions.push({
        type: "suggest_reply_template",
        payload: { template: "storm_damage_response" }
      })
      actions.push({
        type: "add_tag",
        payload: { tag: "storm-damage" }
      })
      break

    case "inspection_workflow":
      actions.push({
        type: "create_task",
        payload: {
          title: "Schedule inspection appointment",
          due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
          priority: "normal"
        }
      })
      actions.push({
        type: "suggest_reply_template",
        payload: { template: "inspection_scheduling" }
      })
      break
  }

  // Add missing information prompts
  if (context?.missingInformation && context.missingInformation.length > 0) {
    const missingInfoActions = context.missingInformation.map((field) => ({
      type: "suggest_question",
      payload: { field, question: getQuestionForField(field) }
    }))
    actions.push(...missingInfoActions)
  }

  return actions
}

function getQuestionForField(field: string): string {
  const questions: Record<string, string> = {
    photos: "Can you send photos of the damage?",
    address: "What's the full address?",
    roof_age: "How old is your roof?",
    timeline: "When do you need this completed?",
    specific_location: "Where exactly is the leak located?",
    insurance_info: "Is insurance involved?",
    roof_size: "What's the approximate square footage of your roof?",
    claim_number: "Do you have an insurance claim number?",
  }
  return questions[field] || `Can you provide more information about ${field}?`
}

/**
 * Execute workflow actions (placeholder - integrate with your task/automation system)
 */
export async function executeWorkflowActions(
  threadId: string,
  actions: WorkflowAction[]
): Promise<void> {
  // This would integrate with your task creation, tagging, and automation systems
  // For now, this is a placeholder that logs the actions
  
  console.log(`Executing ${actions.length} workflow actions for thread ${threadId}:`, actions)
  
  // TODO: Integrate with:
  // - Task creation API
  // - Tagging system
  // - Pipeline stage updates
  // - Reply template suggestions
  // - Priority setting
}



















































