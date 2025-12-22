import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface InsightsData {
  replies_today: number;
  high_intent_replies: number;
  meetings_detected: number;
  send_volume_today: number;
  send_plan_capacity: number;
  bounce_rate_7d: number;
  mailbox_health: Array<{ email: string; health: number; bounce_rate?: number }>;
  pipeline: {
    active: number;
    meetings: number;
    proposal: number;
    closed_won: number;
    closed_lost: number;
  };
  template_performance: Array<{
    template_id: string;
    template_name?: string;
    opens: number;
    replies: number;
    meetings: number;
    reply_rate?: number;
  }>;
  enrichment_score_avg: number;
  enrichment_summary: {
    enriched_count: number;
    missing_domain: number;
    needs_re_enrichment: number;
  };
  ai_insights: string[];
}

Deno.serve(async () => {
  try {
    // Get all workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return new Response(
        JSON.stringify({ ok: false, error: workspacesError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let processed = 0;
    const errors: string[] = [];

    for (const workspace of workspaces || []) {
      try {
        const insights = await generateInsightsForWorkspace(
          workspace.id,
          todayStart,
          todayEnd,
          sevenDaysAgo
        );

        // Upsert insights cache
        const { error: cacheError } = await supabase
          .from("insights_cache")
          .upsert(
            {
              workspace_id: workspace.id,
              date: todayStart,
              data: insights,
            },
            {
              onConflict: "workspace_id,date",
            }
          );

        if (cacheError) {
          console.error(`Error caching insights for workspace ${workspace.id}:`, cacheError);
          errors.push(`Workspace ${workspace.id}: ${cacheError.message}`);
        } else {
          processed++;
        }
      } catch (e) {
        console.error(`Error processing workspace ${workspace.id}:`, e);
        errors.push(`Workspace ${workspace.id}: ${String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("Error in generate-insights-v1:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function generateInsightsForWorkspace(
  workspaceId: string,
  todayStart: string,
  todayEnd: string,
  sevenDaysAgo: string
): Promise<InsightsData> {
  // A) Reply Stats
  // Try to get replies via reply_threads with workspace_id first
  let workspaceReplies: any[] = [];
  
  // Check if reply_threads has workspace_id column
  const { data: threads } = await supabase
    .from("reply_threads")
    .select("id, workspace_id, account_id, lead_id")
    .gte("updated_at", todayStart)
    .lt("updated_at", todayEnd)
    .limit(1000);

  if (threads && threads.length > 0) {
    // Filter threads by workspace
    const workspaceThreadIds = new Set(
      threads
        .filter((t: any) => {
          // Check if workspace_id exists and matches, or check via lead_id
          if (t.workspace_id === workspaceId) return true;
          // If no workspace_id, check via lead
          if (!t.workspace_id && t.lead_id) {
            // We'll filter by lead workspace below
            return true;
          }
          return false;
        })
        .map((t: any) => t.id)
    );

    // Get reply_labels for these threads
    if (workspaceThreadIds.size > 0) {
      const { data: repliesToday } = await supabase
        .from("reply_labels")
        .select("id, label, thread_id")
        .in("thread_id", Array.from(workspaceThreadIds))
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd);

      workspaceReplies = repliesToday || [];
    }
  } else {
    // Fallback: try to get replies via leads
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1000);

    if (leads && leads.length > 0) {
      const leadIds = leads.map((l) => l.id);
      const { data: threadsByLead } = await supabase
        .from("reply_threads")
        .select("id")
        .in("lead_id", leadIds)
        .limit(1000);

      if (threadsByLead && threadsByLead.length > 0) {
        const threadIds = threadsByLead.map((t) => t.id);
        const { data: repliesToday } = await supabase
          .from("reply_labels")
          .select("id, label, thread_id")
          .in("thread_id", threadIds)
          .gte("created_at", todayStart)
          .lt("created_at", todayEnd);

        workspaceReplies = repliesToday || [];
      }
    }
  }

  const replies_today = workspaceReplies.length;
  const highIntent = workspaceReplies.filter(
    (r) => r.label === "meeting_intent" || r.label === "interested"
  ).length;
  const meetings_detected = workspaceReplies.filter(
    (r) => r.label === "meeting_intent"
  ).length;

  // B) Send Stats
  // Try to get sends via campaigns first (more reliable)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(100);

  let send_volume_today = 0;
  if (campaigns && campaigns.length > 0) {
    const campaignIds = campaigns.map((c) => c.id);
    const { data: sentToday } = await supabase
      .from("send_logs")
      .select("id")
      .in("campaign_id", campaignIds)
      .gte("sent_at", todayStart)
      .lt("sent_at", todayEnd);

    send_volume_today = sentToday?.length || 0;
  }

  // Get send plan capacity
  const todayDate = new Date(todayStart).toISOString().split("T")[0];
  const { data: sendPlan } = await supabase
    .from("send_plan")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .eq("date", todayDate)
    .single();

  let send_plan_capacity = 0;
  if (sendPlan?.plan) {
    const plan = Array.isArray(sendPlan.plan) ? sendPlan.plan : [];
    send_plan_capacity = plan.reduce(
      (sum: number, entry: any) => sum + (entry.max_sends || 0),
      0
    );
  }

  // C) Mailbox Health
  const { data: mailboxes } = await supabase
    .from("mailboxes")
    .select("id, email, from_email, health_score, workspace_id")
    .eq("workspace_id", workspaceId);

  const mailboxHealth = await Promise.all(
    (mailboxes || []).map(async (m) => {
      const email = m.email || m.from_email || "";
      
      // Calculate 7-day bounce rate for this mailbox
      const { data: bounces } = await supabase
        .from("bounces")
        .select("id")
        .eq("mailbox_id", m.id)
        .gte("created_at", sevenDaysAgo);

      const { data: sends } = await supabase
        .from("send_logs")
        .select("id")
        .eq("mailbox_id", m.id)
        .gte("sent_at", sevenDaysAgo);

      const bounceRate =
        sends && sends.length > 0
          ? ((bounces?.length || 0) / sends.length) * 100
          : 0;

      return {
        email,
        health: m.health_score || 0,
        bounce_rate: bounceRate,
      };
    })
  );

  // Calculate 7-day bounce rate for workspace
  const { data: allBounces } = await supabase
    .from("bounces")
    .select("id")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sevenDaysAgo);

  let allSends: any[] = [];
  if (campaigns && campaigns.length > 0) {
    const campaignIds = campaigns.map((c) => c.id);
    const { data: sends } = await supabase
      .from("send_logs")
      .select("id")
      .in("campaign_id", campaignIds)
      .gte("sent_at", sevenDaysAgo);
    allSends = sends || [];
  }

  const bounce_rate_7d =
    allSends && allSends.length > 0
      ? ((allBounces?.length || 0) / allSends.length) * 100
      : 0;

  // D) Pipeline Summary
  const { data: deals } = await supabase
    .from("deals")
    .select("stage")
    .eq("workspace_id", workspaceId);

  const pipeline = {
    active: deals?.filter((d) => !d.stage.includes("closed")).length || 0,
    meetings: deals?.filter((d) => d.stage === "meeting").length || 0,
    proposal: deals?.filter((d) => d.stage === "proposal").length || 0,
    closed_won: deals?.filter((d) => d.stage === "closed_won").length || 0,
    closed_lost: deals?.filter((d) => d.stage === "closed_lost").length || 0,
  };

  // E) Template Performance
  const { data: templateVariants } = await supabase
    .from("template_variants")
    .select("id, name, campaign_id, opens, replies, sends")
    .in(
      "campaign_id",
      (
        await supabase
          .from("campaigns")
          .select("id")
          .eq("workspace_id", workspaceId)
      ).data?.map((c) => c.id) || []
    );

  const template_performance = await Promise.all(
    (templateVariants || []).map(async (tv) => {
      // Count meetings from reply_labels for this template's sends
      const { data: templateSends } = await supabase
        .from("send_logs")
        .select("lead_id, thread_id")
        .eq("variant_id", tv.id)
        .gte("sent_at", sevenDaysAgo);

      const threadIds = [...new Set((templateSends || []).map((s) => s.thread_id).filter(Boolean))];
      const { data: meetingReplies } = await supabase
        .from("reply_labels")
        .select("id")
        .in("thread_id", threadIds)
        .eq("label", "meeting_intent")
        .gte("created_at", sevenDaysAgo);

      const reply_rate =
        tv.sends && tv.sends > 0 ? ((tv.replies || 0) / tv.sends) * 100 : 0;

      return {
        template_id: tv.id,
        template_name: tv.name,
        opens: tv.opens || 0,
        replies: tv.replies || 0,
        meetings: meetingReplies?.length || 0,
        reply_rate: Math.round(reply_rate * 10) / 10,
      };
    })
  );

  // F) Enrichment Summary
  const { data: leads } = await supabase
    .from("leads")
    .select("enrichment_score, domain, enriched")
    .eq("workspace_id", workspaceId);

  const enrichmentScores = (leads || [])
    .map((l) => l.enrichment_score || 0)
    .filter((s) => s > 0);
  const enrichment_score_avg =
    enrichmentScores.length > 0
      ? Math.round(
          (enrichmentScores.reduce((a, b) => a + b, 0) / enrichmentScores.length) *
            10
        ) / 10
      : 0;

  const enrichment_summary = {
    enriched_count: leads?.filter((l) => l.enriched).length || 0,
    missing_domain: leads?.filter((l) => !l.domain).length || 0,
    needs_re_enrichment: leads?.filter(
      (l) => l.enriched && (l.enrichment_score || 0) < 50
    ).length || 0,
  };

  // G) AI Insight Notes
  const ai_insights = await generateAIInsights({
    replies_today,
    high_intent_replies: highIntent,
    meetings_detected,
    send_volume_today,
    send_plan_capacity,
    bounce_rate_7d,
    pipeline,
    template_performance,
    enrichment_score_avg,
    enrichment_summary,
  });

  return {
    replies_today,
    high_intent_replies: highIntent,
    meetings_detected,
    send_volume_today,
    send_plan_capacity,
    bounce_rate_7d: Math.round(bounce_rate_7d * 10) / 10,
    mailbox_health: mailboxHealth,
    pipeline,
    template_performance,
    enrichment_score_avg,
    enrichment_summary,
    ai_insights,
  };
}

async function generateAIInsights(data: Partial<InsightsData>): Promise<string[]> {
  try {
    const prompt = `You are an AI analytics assistant for SmartSend, an outbound email platform. Generate 2-4 concise, actionable insights based on this data:

- Replies today: ${data.replies_today || 0}
- High intent replies: ${data.high_intent_replies || 0}
- Meetings detected: ${data.meetings_detected || 0}
- Send volume today: ${data.send_volume_today || 0} / ${data.send_plan_capacity || 0}
- 7-day bounce rate: ${data.bounce_rate_7d || 0}%
- Active deals: ${data.pipeline?.active || 0}
- Meetings stage: ${data.pipeline?.meetings || 0}
- Closed won: ${data.pipeline?.closed_won || 0}
- Average enrichment score: ${data.enrichment_score_avg || 0}/100
- Enriched leads: ${data.enrichment_summary?.enriched_count || 0}
- Missing domain: ${data.enrichment_summary?.missing_domain || 0}

Generate insights that:
1. Highlight trends (e.g., "Meeting intent replies increased 22% compared to last week")
2. Provide warnings (e.g., "Mailbox sales@domain.com shows bounce rate rise; consider reducing volume")
3. Give recommendations (e.g., "78 leads need enrichment; running enrichment could improve personalization")

Return ONLY a JSON array of strings, no other text. Example: ["Insight 1", "Insight 2", "Insight 3"]`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return [
        "Meeting intent replies: " + (data.meetings_detected || 0) + " detected today",
        "Send progress: " +
          Math.round(
            ((data.send_volume_today || 0) / Math.max(data.send_plan_capacity || 1, 1)) *
              100
          ) +
          "% of daily plan",
      ];
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "[]";
    
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Fallback if JSON parsing fails
      return [
        "Meeting intent replies: " + (data.meetings_detected || 0) + " detected today",
        "Send progress: " +
          Math.round(
            ((data.send_volume_today || 0) / Math.max(data.send_plan_capacity || 1, 1)) *
              100
          ) +
          "% of daily plan",
      ];
    }
  } catch (e) {
    console.error("Error generating AI insights:", e);
    return [
      "Meeting intent replies: " + (data.meetings_detected || 0) + " detected today",
      "Send progress: " +
        Math.round(
          ((data.send_volume_today || 0) / Math.max(data.send_plan_capacity || 1, 1)) *
            100
        ) +
        "% of daily plan",
    ];
  }
}

