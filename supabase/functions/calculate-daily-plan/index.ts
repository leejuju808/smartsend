// Block 255 — Daily Send Planner v1
// Cron job that runs every morning at 6 AM workspace-local time
// Calculates safe send limits per mailbox and builds daily plan

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface Mailbox {
  id: string;
  workspace_id: string;
  from_email: string;
  daily_cap: number;
  health_score: number;
  warmup_started_at: string | null;
}

interface PlanEntry {
  mailbox_id: string;
  max_sends: number;
  status: string;
}

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // Get all active mailboxes grouped by workspace
    const { data: mailboxes, error: mbError } = await supabase
      .from("mailboxes")
      .select("id, workspace_id, from_email, daily_cap, health_score, warmup_started_at")
      .eq("is_active", true)
      .not("workspace_id", "is", null);
    
    if (mbError) {
      console.error("Error fetching mailboxes:", mbError);
      return new Response(
        JSON.stringify({ ok: false, error: mbError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (!mailboxes || mailboxes.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No mailboxes found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Group mailboxes by workspace
    const workspacePlans = new Map<string, PlanEntry[]>();
    
    for (const mailbox of mailboxes as Mailbox[]) {
      if (!mailbox.workspace_id) continue;
      
      // Compute safe limit using SQL function
      const { data: safeLimitData, error: limitError } = await supabase
        .rpc("compute_safe_limit", { p_mailbox_id: mailbox.id });
      
      if (limitError) {
        console.error(`Error computing safe limit for mailbox ${mailbox.id}:`, limitError);
        continue;
      }
      
      const safeLimit = safeLimitData as number || 0;
      
      // Determine status
      let status = "healthy";
      if (safeLimit === 0) {
        status = "paused";
      } else {
        // Check bounce rate for status
        const { data: bounceRateData } = await supabase
          .rpc("compute_7d_bounce_rate", { p_mailbox_id: mailbox.id });
        
        const bounceRate = bounceRateData as number || 0;
        if (bounceRate > 5) {
          status = "throttled";
        }
      }
      
      const planEntry: PlanEntry = {
        mailbox_id: mailbox.id,
        max_sends: safeLimit,
        status: status
      };
      
      if (!workspacePlans.has(mailbox.workspace_id)) {
        workspacePlans.set(mailbox.workspace_id, []);
      }
      workspacePlans.get(mailbox.workspace_id)!.push(planEntry);
    }
    
    // Save plans for each workspace
    let plansCreated = 0;
    for (const [workspaceId, plan] of workspacePlans.entries()) {
      const { error: planError } = await supabase
        .from("send_plan")
        .upsert({
          workspace_id: workspaceId,
          date: today,
          plan: plan,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "workspace_id,date"
        });
      
      if (planError) {
        console.error(`Error saving plan for workspace ${workspaceId}:`, planError);
      } else {
        plansCreated++;
      }
    }
    
    return new Response(
      JSON.stringify({
        ok: true,
        plans_created: plansCreated,
        mailboxes_processed: mailboxes.length
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









