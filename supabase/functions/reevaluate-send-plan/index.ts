// Block 255 — Daily Send Planner v1
// Hourly re-evaluation function
// Checks for bounce spikes, spam blocks, and health improvements

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // Get today's plans
    const { data: plans, error: plansError } = await supabase
      .from("send_plan")
      .select("id, workspace_id, plan")
      .eq("date", today);
    
    if (plansError) {
      console.error("Error fetching plans:", plansError);
      return new Response(
        JSON.stringify({ ok: false, error: plansError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (!plans || plans.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No plans found for today" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    let plansUpdated = 0;
    let mailboxesPaused = 0;
    let mailboxesThrottled = 0;
    
    for (const plan of plans) {
      const planEntries = plan.plan as Array<{ mailbox_id: string; max_sends: number; status: string }>;
      const updatedPlan: typeof planEntries = [];
      let planChanged = false;
      
      for (const entry of planEntries) {
        // Recompute safe limit
        const { data: safeLimitData } = await supabase
          .rpc("compute_safe_limit", { p_mailbox_id: entry.mailbox_id });
        
        const newSafeLimit = safeLimitData as number || 0;
        
        // Get bounce rate
        const { data: bounceRateData } = await supabase
          .rpc("compute_7d_bounce_rate", { p_mailbox_id: entry.mailbox_id });
        
        const bounceRate = bounceRateData as number || 0;
        
        // Determine new status
        let newStatus = "healthy";
        if (newSafeLimit === 0 || bounceRate > 10) {
          newStatus = "paused";
          if (entry.status !== "paused") {
            mailboxesPaused++;
          }
        } else if (bounceRate > 5) {
          newStatus = "throttled";
          if (entry.status !== "throttled") {
            mailboxesThrottled++;
          }
        }
        
        // Check if limit changed significantly (more than 10%)
        const limitDiff = Math.abs(newSafeLimit - entry.max_sends);
        const shouldUpdate = limitDiff > (entry.max_sends * 0.1) || newStatus !== entry.status;
        
        if (shouldUpdate) {
          planChanged = true;
          updatedPlan.push({
            mailbox_id: entry.mailbox_id,
            max_sends: newSafeLimit,
            status: newStatus
          });
        } else {
          updatedPlan.push(entry);
        }
      }
      
      // Update plan if changed
      if (planChanged) {
        const { error: updateError } = await supabase
          .from("send_plan")
          .update({
            plan: updatedPlan,
            updated_at: new Date().toISOString()
          })
          .eq("id", plan.id);
        
        if (updateError) {
          console.error(`Error updating plan ${plan.id}:`, updateError);
        } else {
          plansUpdated++;
        }
      }
    }
    
    return new Response(
      JSON.stringify({
        ok: true,
        plans_updated: plansUpdated,
        mailboxes_paused: mailboxesPaused,
        mailboxes_throttled: mailboxesThrottled
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









