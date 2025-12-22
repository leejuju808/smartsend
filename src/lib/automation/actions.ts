import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AutomationAction = {
  action_type: string;
  action_payload: any;
};

export type ActionContext = {
  email: string;
  campaign_id?: string;
  workspace_id?: string;
};

export async function runAction(
  action: AutomationAction, 
  ctx: ActionContext
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.action_type) {
      case "tag":
        await supabase.rpc("add_contact_tag", { 
          p_email: ctx.email, 
          p_tag: action.action_payload?.tag || "tagged" 
        });
        break;
        
      case "assign":
        if (action.action_payload?.user_id) {
          await supabase
            .from("inbox_threads")
            .update({ assigned_to: action.action_payload.user_id })
            .eq("contact_id", (
              await supabase
                .from("contacts")
                .select("id")
                .eq("email", ctx.email)
                .single()
            ).data?.id);
        }
        break;
        
      case "enroll_sequence":
        if (action.action_payload?.sequence_id) {
          await supabase
            .from("sequence_enrollments")
            .upsert({ 
              sequence_id: action.action_payload.sequence_id, 
              email: ctx.email,
              current_step: 0
            }, { onConflict: "sequence_id,email" });
        }
        break;
        
      case "suppress":
        await supabase
          .from("suppression_emails")
          .upsert({ 
            email: ctx.email, 
            source: "automation", 
            reason: "rule_triggered" 
          }, { onConflict: "email" });
        break;
        
      case "pause_campaign":
        if (ctx.campaign_id) {
          await supabase
            .from("campaigns")
            .update({ status: "paused" })
            .eq("id", ctx.campaign_id);
        }
        break;
        
      case "increment_score":
        if (action.action_payload?.points) {
          await supabase.rpc("increment_score", { 
            p_email: ctx.email, 
            p_type: "automation" 
          });
        }
        break;
        
      case "send_followup":
        if (action.action_payload?.campaign_id) {
          await supabase
            .from("campaign_recipients")
            .upsert({
              campaign_id: action.action_payload.campaign_id,
              email: ctx.email,
              status: "pending"
            }, { onConflict: "campaign_id,email" });
        }
        break;
        
      default:
        console.warn(`Unknown action type: ${action.action_type}`);
        return { success: false, error: `Unknown action type: ${action.action_type}` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Error executing action ${action.action_type}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function runActions(
  actions: AutomationAction[], 
  ctx: ActionContext
): Promise<{ success: boolean; results: Array<{ action: AutomationAction; result: { success: boolean; error?: string } }> }> {
  const results = [];
  
  for (const action of actions) {
    const result = await runAction(action, ctx);
    results.push({ action, result });
    
    // If an action fails, we continue with others but log the failure
    if (!result.success) {
      console.warn(`Action ${action.action_type} failed:`, result.error);
    }
  }
  
  const allSuccessful = results.every(r => r.result.success);
  return { success: allSuccessful, results };
} 