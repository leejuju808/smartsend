// Block 273 — Lead Scoring v1
// Event-driven lead scoring engine with workspace-level rules

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface ScoringRules {
  email_open: number;
  email_click: number;
  reply: number;
  meeting_intent: number;
  deal_created: number;
  deal_stage_moved: number;
  deal_won: number;
  recent_activity_decay_per_day: number;
  max_score: number;
  min_score: number;
}

const DEFAULT_RULES: ScoringRules = {
  email_open: 2,
  email_click: 5,
  reply: 15,
  meeting_intent: 25,
  deal_created: 10,
  deal_stage_moved: 5,
  deal_won: 40,
  recent_activity_decay_per_day: -1,
  max_score: 100,
  min_score: 0,
};

async function getWorkspaceRules(workspaceId: string): Promise<ScoringRules> {
  const { data, error } = await supabase
    .from("lead_scoring_rules")
    .select("rules")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_RULES;
  }

  // Merge with defaults to ensure all fields exist
  return { ...DEFAULT_RULES, ...(data.rules as Partial<ScoringRules>) };
}

function diffInDays(date1: string | null, date2: Date): number {
  if (!date1) return 0;
  const d1 = new Date(date1);
  const d2 = date2;
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

async function updateLeadScore(
  leadId: string,
  eventType: string,
  workspaceId: string
): Promise<{ ok: boolean; score?: number; error?: string }> {
  try {
    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, score, score_data, last_activity_at")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return { ok: false, error: "Lead not found" };
    }

    // Verify workspace match
    if (lead.workspace_id !== workspaceId) {
      return { ok: false, error: "Workspace mismatch" };
    }

    // Get workspace rules
    const rules = await getWorkspaceRules(workspaceId);

    // Calculate score delta
    let score = lead.score || 0;
    const delta = rules[eventType as keyof ScoringRules] || 0;
    score += delta;

    // Apply decay if last_activity_at exists
    if (lead.last_activity_at) {
      const daysSinceLastActivity = diffInDays(lead.last_activity_at, new Date());
      if (daysSinceLastActivity > 0) {
        const decay = rules.recent_activity_decay_per_day * daysSinceLastActivity;
        score += decay;
      }
    }

    // Clamp score
    score = Math.max(rules.min_score, Math.min(rules.max_score, score));

    // Update score_data
    const scoreData = (lead.score_data as Record<string, number>) || {};
    scoreData[eventType] = (scoreData[eventType] || 0) + delta;

    // Update lead
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        score: Math.round(score),
        score_data: scoreData,
        score_updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (updateError) {
      console.error("Error updating lead score:", updateError);
      return { ok: false, error: updateError.message };
    }

    return { ok: true, score: Math.round(score) };
  } catch (error) {
    console.error("Error in updateLeadScore:", error);
    return { ok: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  try {
    const { lead_id, event_type, workspace_id } = await req.json();

    if (!lead_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id or event_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id from lead if not provided
    let workspaceId = workspace_id;
    if (!workspaceId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", lead_id)
        .single();

      if (!lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      workspaceId = lead.workspace_id;
    }

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "Workspace ID required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await updateLeadScore(lead_id, event_type, workspaceId);

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, score: result.score }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lead-score-v1:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});








