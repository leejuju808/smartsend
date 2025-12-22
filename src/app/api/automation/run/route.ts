import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ruleMatches, getMatchingRules } from "@/lib/automation/engine";
import { runActions } from "@/lib/automation/actions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const ctx = await req.json(); // {email, campaign_id?, url?, event_type?, lead_score?}
    
    if (!ctx.email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Get workspace_id if not provided
    if (!ctx.workspace_id) {
      if (ctx.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", ctx.campaign_id)
          .single();
        ctx.workspace_id = campaign?.workspace_id;
      } else {
        const { data: contact } = await supabase
          .from("contacts")
          .select("workspace_id")
          .eq("email", ctx.email)
          .single();
        ctx.workspace_id = contact?.workspace_id;
      }
    }

    // Get all enabled rules
    const { data: rules, error } = await supabase
      .from("automation_rules")
      .select(`
        *,
        automation_actions (*)
      `)
      .eq("is_enabled", true);

    if (error) {
      console.error("Error fetching rules:", error);
      return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
    }

    // Find matching rules
    const matchingRules = getMatchingRules(rules || [], ctx);
    const fired: string[] = [];
    const results: any[] = [];

    // Execute actions for each matching rule
    for (const rule of matchingRules) {
      try {
        const ruleWithActions = { ...rule, actions: rule.automation_actions || [] };
        
        if (ruleWithActions.actions.length > 0) {
          const actionResults = await runActions(ruleWithActions.actions, {
            email: ctx.email,
            campaign_id: ctx.campaign_id,
            workspace_id: ctx.workspace_id
          });

          results.push({
            rule_id: rule.id,
            rule_name: rule.name,
            actions_executed: ruleWithActions.actions.length,
            success: actionResults.success,
            results: actionResults.results
          });

          if (actionResults.success) {
            fired.push(rule.id);
          }
        }
      } catch (error) {
        console.error(`Error executing rule ${rule.id}:`, error);
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return NextResponse.json({ 
      ok: true, 
      fired,
      total_rules: rules?.length || 0,
      matching_rules: matchingRules.length,
      results
    });
  } catch (error) {
    console.error("Error in automation run:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
} 