import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // Get all active guidelines
    const { data: activeGuidelines, error: activeError } = await sb
      .from("rewrite_guidelines")
      .select("id, tone, approved_at")
      .eq("status", "active");

    if (activeError) {
      console.error("Error fetching active guidelines:", activeError);
      return new Response(JSON.stringify({ error: activeError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!activeGuidelines || activeGuidelines.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let rolledBack = 0;

    for (const guideline of activeGuidelines) {
      const approvedAt = new Date(guideline.approved_at);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Only check guidelines approved more than a week ago
      if (approvedAt > oneWeekAgo) continue;

      // Get engagement scores before and after approval
      const beforeDate = approvedAt.toISOString();
      const afterDate = new Date(approvedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Get feedback before approval (last 7 days before approval)
      const { data: beforeFeedback } = await sb
        .from("llm_rewrite_feedback")
        .select("engagement_score, message_count")
        .eq("tone", guideline.tone)
        .lt("created_at", beforeDate)
        .gte("created_at", new Date(approvedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });

      // Get feedback after approval (7 days after)
      const { data: afterFeedback } = await sb
        .from("llm_rewrite_feedback")
        .select("engagement_score, message_count")
        .eq("tone", guideline.tone)
        .gte("created_at", beforeDate)
        .lte("created_at", afterDate)
        .order("created_at", { ascending: false });

      if (!beforeFeedback || !afterFeedback || beforeFeedback.length === 0 || afterFeedback.length === 0) {
        continue;
      }

      // Calculate weighted average engagement scores
      const beforeAvg = beforeFeedback.reduce((sum, f) => {
        return sum + (f.engagement_score as number) * (f.message_count as number);
      }, 0) / beforeFeedback.reduce((sum, f) => sum + (f.message_count as number), 0);

      const afterAvg = afterFeedback.reduce((sum, f) => {
        return sum + (f.engagement_score as number) * (f.message_count as number);
      }, 0) / afterFeedback.reduce((sum, f) => sum + (f.message_count as number), 0);

      // Check if engagement dropped more than 20%
      const dropPercent = ((beforeAvg - afterAvg) / beforeAvg) * 100;

      if (dropPercent > 20) {
        // Rollback: archive this guideline and reactivate the previous one
        await sb
          .from("rewrite_guidelines")
          .update({ status: "archived" })
          .eq("id", guideline.id);

        // Find the most recent archived guideline for this tone (before this one)
        const { data: previousGuideline } = await sb
          .from("rewrite_guidelines")
          .select("id")
          .eq("tone", guideline.tone)
          .eq("status", "archived")
          .lt("approved_at", guideline.approved_at)
          .order("approved_at", { ascending: false })
          .limit(1)
          .single();

        if (previousGuideline) {
          await sb
            .from("rewrite_guidelines")
            .update({ status: "active", approved_at: new Date().toISOString() })
            .eq("id", previousGuideline.id);
        }

        // Log rollback
        await sb.from("system_logs").insert({
          category: "ai_rewrite_tuning",
          level: "warn",
          context: {
            guideline_id: guideline.id,
            tone: guideline.tone,
            before_avg: beforeAvg,
            after_avg: afterAvg,
            drop_percent: dropPercent,
          },
          message: `Rewrite guidelines rolled back for tone ${guideline.tone}: engagement dropped ${dropPercent.toFixed(1)}%`,
        });

        rolledBack++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked: activeGuidelines.length, rolled_back: rolledBack }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});















