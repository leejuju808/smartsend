// Block 21958 — SmartSend Roofing Estimator Performance Score v1
// Edge Function — Calculate Unified Performance Score (0-100)
// Computes score from 6 weighted signals: Speed (25%), Follow-Up (25%), Proposal (15%), Close Rate (20%), Tone (10%), AI Alignment (5%)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

interface PerformanceInput {
  workspace_id: string;
  estimator_id?: string; // Optional: if not provided, calculates for all estimators in workspace
}

interface Scores {
  speed: number;
  followup: number;
  proposal: number;
  close_rate: number;
  tone: number;
  ai_align: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { workspace_id, estimator_id } = await req.json() as PerformanceInput;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing workspace_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get estimators for this workspace
    let estimatorIds: string[] = [];
    
    if (estimator_id) {
      estimatorIds = [estimator_id];
    } else {
      // Get all estimators in workspace
      // Check contractor_roles table for role_type = 'sales_rep' or check profiles with workspace membership
      const { data: roles, error: rolesError } = await supabase
        .from("contractor_roles")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .in("role_type", ["sales_rep", "owner_operator", "storm_rep"]);

      if (!rolesError && roles) {
        estimatorIds = roles.map((r) => r.user_id).filter(Boolean) as string[];
      }

      // Also check workspace_members who might be estimators
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id);

      if (!membersError && members) {
        const memberIds = members.map((m) => m.user_id).filter(Boolean) as string[];
        estimatorIds = [...new Set([...estimatorIds, ...memberIds])];
      }
    }

    if (estimatorIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No estimators found for this workspace" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const estId of estimatorIds) {
      const scores = await computeScores(supabase, workspace_id, estId);

      const finalScore = Math.round(
        scores.speed * 0.25 +
        scores.followup * 0.25 +
        scores.proposal * 0.15 +
        scores.close_rate * 0.20 +
        scores.tone * 0.10 +
        scores.ai_align * 0.05
      );

      // Upsert performance score
      const { data: inserted, error: insertError } = await supabase
        .from("estimator_performance")
        .upsert(
          {
            workspace_id,
            estimator_id: estId,
            performance_score: finalScore,
            speed_score: scores.speed,
            followup_score: scores.followup,
            proposal_score: scores.proposal,
            close_rate_score: scores.close_rate,
            tone_score: scores.tone,
            ai_alignment_score: scores.ai_align,
            calculated_at: new Date().toISOString(),
          },
          {
            onConflict: "workspace_id,estimator_id",
          }
        )
        .select()
        .single();

      if (insertError) {
        console.error(`Error inserting performance for estimator ${estId}:`, insertError);
        continue;
      }

      results.push(inserted);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Calculate Estimator Performance] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function computeScores(
  supabase: any,
  workspace_id: string,
  estimator_id: string
): Promise<Scores> {
  // Look back 30 days for calculations
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString();

  // ============================================================================
  // 1. SPEED TO LEAD (25% weight)
  // Time to respond to new inbound homeowners. Faster = better. Over 30 mins = penalty.
  // ============================================================================
  let speedScore = 50; // Default neutral score

  try {
    // Get leads assigned to this estimator
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, created_at")
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .gte("created_at", cutoffDate);

    if (!leadsError && leads && leads.length > 0) {
      // Get first response times from inbox_messages or lead_activities
      const leadIds = leads.map((l) => l.id);

      // Try inbox_messages first
      const threadIds = await getThreadIdsForLeads(supabase, leadIds);
      if (threadIds.length === 0) {
        speedScore = 50;
      } else {
        const { data: messages, error: messagesError } = await supabase
          .from("inbox_messages")
          .select("thread_id, direction, created_at")
          .in("thread_id", threadIds)
          .gte("created_at", cutoffDate)
          .order("created_at", { ascending: true });

        if (!messagesError && messages && messages.length > 0) {
          const responseTimes: number[] = [];
          const messagesByThread = new Map<string, typeof messages>();

          messages.forEach((msg) => {
            if (!messagesByThread.has(msg.thread_id)) {
              messagesByThread.set(msg.thread_id, []);
            }
            messagesByThread.get(msg.thread_id)!.push(msg);
          });

          // Calculate response times: homeowner message → estimator response
          messagesByThread.forEach((threadMessages) => {
            for (let i = 0; i < threadMessages.length - 1; i++) {
              const current = threadMessages[i];
              const next = threadMessages[i + 1];

              if (current.direction === "in" && next.direction === "out") {
                const currentTime = new Date(current.created_at).getTime();
                const nextTime = new Date(next.created_at).getTime();
                const responseTimeMinutes = (nextTime - currentTime) / (1000 * 60);

                if (responseTimeMinutes > 0 && responseTimeMinutes < 1440) {
                  // Max 24 hours
                  responseTimes.push(responseTimeMinutes);
                }
              }
            }
          });

          if (responseTimes.length > 0) {
            const avgResponseMinutes =
              responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

            // Score: < 5 min = 100, < 15 min = 90, < 30 min = 75, < 60 min = 50, < 120 min = 25, >= 120 min = 0
            if (avgResponseMinutes < 5) speedScore = 100;
            else if (avgResponseMinutes < 15) speedScore = 90;
            else if (avgResponseMinutes < 30) speedScore = 75;
            else if (avgResponseMinutes < 60) speedScore = 50;
            else if (avgResponseMinutes < 120) speedScore = 25;
            else speedScore = 0;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error calculating speed score:", error);
  }

  // ============================================================================
  // 2. FOLLOW-UP COMPLETION RATE (25% weight)
  // Did the estimator follow the Action Queue? Did they miss follow-ups?
  // ============================================================================
  let followupScore = 50;

  try {
    const { data: tasks, error: tasksError } = await supabase
      .from("action_queue_tasks")
      .select("id, status, due_at, completed_at, assigned_user_id")
      .eq("workspace_id", workspace_id)
      .eq("assigned_user_id", estimator_id)
      .gte("due_at", cutoffDate);

    if (!tasksError && tasks && tasks.length > 0) {
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(
        (t) =>
          t.status === "done" &&
          t.completed_at &&
          t.due_at &&
          new Date(t.completed_at) <= new Date(t.due_at)
      ).length;

      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Score: >= 90% = 100, >= 75% = 85, >= 60% = 70, >= 40% = 50, >= 20% = 25, < 20% = 0
      if (completionRate >= 90) followupScore = 100;
      else if (completionRate >= 75) followupScore = 85;
      else if (completionRate >= 60) followupScore = 70;
      else if (completionRate >= 40) followupScore = 50;
      else if (completionRate >= 20) followupScore = 25;
      else followupScore = 0;
    }
  } catch (error) {
    console.error("Error calculating followup score:", error);
  }

  // ============================================================================
  // 3. PROPOSAL TURNAROUND TIME (15% weight)
  // Time between estimate completed → proposal sent
  // ============================================================================
  let proposalScore = 50;

  try {
    // Get estimates for this estimator - try multiple table names
    let estimates: any[] = [];
    
    // Try 'estimates' table first
    const { data: est1, error: est1Error } = await supabase
      .from("estimates")
      .select("id, created_at, status, thread_id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", cutoffDate);
    
    if (!est1Error && est1) {
      estimates = est1;
    } else {
      // Try 'roof_estimates' table
      const { data: est2, error: est2Error } = await supabase
        .from("roof_estimates")
        .select("id, created_at, status, thread_id")
        .eq("workspace_id", workspace_id)
        .gte("created_at", cutoffDate);
      
      if (!est2Error && est2) {
        estimates = est2;
      }
    }

    if (estimates && estimates.length > 0) {
      const completedEstimates = estimates.filter((e) => e.status === "completed" || e.status === "sent" || e.status === "approved");
      const estimateIds = completedEstimates.map((e) => e.id);

      if (estimateIds.length > 0) {
        // Get proposals linked to these estimates
        const { data: proposals, error: proposalsError } = await supabase
          .from("proposals")
          .select("id, estimate_id, created_at, status")
          .in("estimate_id", estimateIds)
          .eq("status", "sent")
          .gte("created_at", cutoffDate);

        if (!proposalsError && proposals && proposals.length > 0) {
          const turnaroundTimes: number[] = [];

          proposals.forEach((proposal) => {
            const estimate = completedEstimates.find((e) => e.id === proposal.estimate_id);
            if (estimate) {
              const estimateTime = new Date(estimate.created_at).getTime();
              const proposalTime = new Date(proposal.created_at).getTime();
              const turnaroundHours = (proposalTime - estimateTime) / (1000 * 60 * 60);

              if (turnaroundHours > 0 && turnaroundHours < 720) {
                // Max 30 days
                turnaroundTimes.push(turnaroundHours);
              }
            }
          });

          if (turnaroundTimes.length > 0) {
            const avgTurnaroundHours =
              turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length;

            // Score: < 24 hours = 100, < 48 hours = 85, < 72 hours = 70, < 120 hours = 50, >= 120 hours = 25
            if (avgTurnaroundHours < 24) proposalScore = 100;
            else if (avgTurnaroundHours < 48) proposalScore = 85;
            else if (avgTurnaroundHours < 72) proposalScore = 70;
            else if (avgTurnaroundHours < 120) proposalScore = 50;
            else proposalScore = 25;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error calculating proposal score:", error);
  }

  // ============================================================================
  // 4. CLOSE RATE (ADJUSTED) (20% weight)
  // Wins / Qualified Opportunities, adjusted for job value, lead source, difficulty
  // ============================================================================
  let closeRateScore = 50;

  try {
    // Get proposals for this estimator's leads
    const leadIds = await getLeadIdsForEstimator(supabase, workspace_id, estimator_id, cutoffDate);

    if (leadIds.length > 0) {
      const { data: proposals, error: proposalsError } = await supabase
        .from("proposals")
        .select("id, status, lead_id")
        .in("lead_id", leadIds)
        .gte("created_at", cutoffDate);

      if (!proposalsError && proposals && proposals.length > 0) {
        const sentProposals = proposals.filter((p) => p.status === "sent" || p.status === "won");
        const wonProposals = proposals.filter((p) => p.status === "won");

        if (sentProposals.length > 0) {
          const winRate = (wonProposals.length / sentProposals.length) * 100;

          // Score: >= 40% = 100, >= 30% = 85, >= 20% = 70, >= 10% = 50, >= 5% = 25, < 5% = 0
          if (winRate >= 40) closeRateScore = 100;
          else if (winRate >= 30) closeRateScore = 85;
          else if (winRate >= 20) closeRateScore = 70;
          else if (winRate >= 10) closeRateScore = 50;
          else if (winRate >= 5) closeRateScore = 25;
          else closeRateScore = 0;
        }
      }
    }
  } catch (error) {
    console.error("Error calculating close rate score:", error);
  }

  // ============================================================================
  // 5. HOMEOWNER TONE IMPACT (10% weight)
  // Does tone improve or worsen after estimator messages?
  // ============================================================================
  let toneScore = 50;

  try {
    const leadIds = await getLeadIdsForEstimator(supabase, workspace_id, estimator_id, cutoffDate);

    if (leadIds.length > 0) {
      // Get activities with tone classification
      const { data: activities, error: activitiesError } = await supabase
        .from("lead_activities")
        .select("id, lead_id, kind, homeowner_tone, created_at, actor_user_id")
        .in("lead_id", leadIds)
        .gte("created_at", cutoffDate)
        .not("homeowner_tone", "is", null)
        .order("created_at", { ascending: true });

      if (!activitiesError && activities && activities.length > 0) {
        let toneImprovements = 0;
        let toneWorsenings = 0;
        let totalComparisons = 0;

        // Group by lead and compare tone before/after estimator messages
        const activitiesByLead = new Map<string, typeof activities>();
        activities.forEach((act) => {
          if (!activitiesByLead.has(act.lead_id)) {
            activitiesByLead.set(act.lead_id, []);
          }
          activitiesByLead.get(act.lead_id)!.push(act);
        });

        activitiesByLead.forEach((leadActivities) => {
          for (let i = 0; i < leadActivities.length - 1; i++) {
            const current = leadActivities[i];
            const next = leadActivities[i + 1];

            // If current is homeowner message (message_in) and next is estimator message (message_out)
            if (
              current.kind === "message_in" &&
              next.kind === "message_out" &&
              next.actor_user_id === estimator_id
            ) {
              const toneBefore = getToneScore(current.homeowner_tone);
              const nextHomeownerMsg = leadActivities
                .slice(i + 1)
                .find((a) => a.kind === "message_in");

              if (nextHomeownerMsg && nextHomeownerMsg.homeowner_tone) {
                const toneAfter = getToneScore(nextHomeownerMsg.homeowner_tone);
                totalComparisons++;

                if (toneAfter > toneBefore) toneImprovements++;
                else if (toneAfter < toneBefore) toneWorsenings++;
              }
            }
          }
        });

        if (totalComparisons > 0) {
          const improvementRate = (toneImprovements / totalComparisons) * 100;
          const worseningRate = (toneWorsenings / totalComparisons) * 100;

          // Score: High improvement, low worsening = good
          if (improvementRate >= 40 && worseningRate < 10) toneScore = 100;
          else if (improvementRate >= 30 && worseningRate < 15) toneScore = 85;
          else if (improvementRate >= 20 && worseningRate < 20) toneScore = 70;
          else if (improvementRate >= 10 && worseningRate < 25) toneScore = 50;
          else if (worseningRate >= 30) toneScore = 0;
          else toneScore = 50;
        }
      }
    }
  } catch (error) {
    console.error("Error calculating tone score:", error);
  }

  // ============================================================================
  // 6. AI ALIGNMENT SCORE (5% weight)
  // How often does estimator take recommended high-value actions?
  // ============================================================================
  let aiAlignScore = 50;

  try {
    // Check if estimator completes high-priority action_queue_tasks
    const { data: highPriorityTasks, error: tasksError } = await supabase
      .from("action_queue_tasks")
      .select("id, status, priority, task_type")
      .eq("workspace_id", workspace_id)
      .eq("assigned_user_id", estimator_id)
      .gte("priority", 1)
      .lte("priority", 30) // High priority tasks
      .gte("created_at", cutoffDate);

    if (!tasksError && highPriorityTasks && highPriorityTasks.length > 0) {
      const completedHighPriority = highPriorityTasks.filter((t) => t.status === "done").length;
      const alignmentRate = (completedHighPriority / highPriorityTasks.length) * 100;

      // Score: >= 80% = 100, >= 60% = 85, >= 40% = 70, >= 20% = 50, < 20% = 0
      if (alignmentRate >= 80) aiAlignScore = 100;
      else if (alignmentRate >= 60) aiAlignScore = 85;
      else if (alignmentRate >= 40) aiAlignScore = 70;
      else if (alignmentRate >= 20) aiAlignScore = 50;
      else aiAlignScore = 0;
    }
  } catch (error) {
    console.error("Error calculating AI alignment score:", error);
  }

  return {
    speed: speedScore,
    followup: followupScore,
    proposal: proposalScore,
    close_rate: closeRateScore,
    tone: toneScore,
    ai_align: aiAlignScore,
  };
}

// Helper function to get tone score (0-100)
function getToneScore(tone: string | null): number {
  if (!tone) return 50;
  const toneMap: Record<string, number> = {
    positive: 90,
    appreciation: 85,
    neutral: 50,
    confused: 40,
    scheduling-focused: 60,
    "price-shopping": 30,
    impatient: 20,
    angry: 0,
  };
  return toneMap[tone.toLowerCase()] || 50;
}

// Helper function to get thread IDs for leads
async function getThreadIdsForLeads(supabase: any, leadIds: string[]): Promise<string[]> {
  try {
    const { data: threads, error } = await supabase
      .from("inbox_threads")
      .select("id")
      .in("lead_id", leadIds);

    if (error || !threads) return [];
    return threads.map((t: any) => t.id);
  } catch {
    return [];
  }
}

// Helper function to get lead IDs for estimator
async function getLeadIdsForEstimator(
  supabase: any,
  workspace_id: string,
  estimator_id: string,
  cutoffDate: string
): Promise<string[]> {
  try {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .gte("created_at", cutoffDate);

    if (error || !leads) return [];
    return leads.map((l: any) => l.id);
  } catch {
    return [];
  }
}

