// lib/workflows/getAutoWorkflows.ts
// Block 16100 — Load workspace workflow automation settings

import { createClient } from "@/lib/supabase/server";

export type AutoWorkflows = {
  on_reply_create_task: boolean;
  on_hot_lead_stage_change: boolean;
  on_warm_lead_stage_change: boolean;
  on_won_log_revenue: boolean;
};

const DEFAULT_WORKFLOWS: AutoWorkflows = {
  on_reply_create_task: true,
  on_hot_lead_stage_change: true,
  on_warm_lead_stage_change: true,
  on_won_log_revenue: true,
};

export async function getAutoWorkflows(
  workspaceId: string
): Promise<AutoWorkflows> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workspaces")
    .select("auto_workflows")
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    return DEFAULT_WORKFLOWS;
  }

  return {
    on_reply_create_task:
      data.auto_workflows?.on_reply_create_task ?? true,
    on_hot_lead_stage_change:
      data.auto_workflows?.on_hot_lead_stage_change ?? true,
    on_warm_lead_stage_change:
      data.auto_workflows?.on_warm_lead_stage_change ?? true,
    on_won_log_revenue:
      data.auto_workflows?.on_won_log_revenue ?? true,
  };
}



























































