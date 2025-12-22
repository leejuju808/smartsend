import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

interface FeedbackRow {
  tone: string;
  engagement_score: number;
  positive_rate: number;
  message_count: number;
}

async function tuneRewritePrompt(
  openai: OpenAI,
  feedbackRows: FeedbackRow[]
): Promise<string> {
  if (feedbackRows.length === 0) {
    return JSON.stringify({ message: "No feedback data available" });
  }

  const sorted = [...feedbackRows].sort((a, b) => b.engagement_score - a.engagement_score);
  const top = sorted.slice(0, 5);
  const bottom = sorted.slice(-5);

  const summary = {
    best: top.map((x) => ({
      tone: x.tone,
      score: x.engagement_score,
      positive: x.positive_rate,
      samples: x.message_count,
    })),
    worst: bottom.map((x) => ({
      tone: x.tone,
      score: x.engagement_score,
      positive: x.positive_rate,
      samples: x.message_count,
    })),
  };

  const prompt = `You are refining rewrite guidelines for SmartSend AI follow-up emails.

Here are recent results (higher engagement = better):

Best performers:
${JSON.stringify(summary.best, null, 2)}

Worst performers:
${JSON.stringify(summary.worst, null, 2)}

Rewrite rules to improve lower-performing tones:
- Keep merge tags like {{first_name}} intact.
- Adjust sentence rhythm and CTA phrasing according to engagement differences.
- Focus on what makes top performers successful.
- Avoid patterns that correlate with low engagement.

Output: Updated rewrite guidelines JSON with per-tone advice. Format:
{
  "guidelines": {
    "formal": { "advice": "...", "recommendations": ["..."] },
    "casual": { "advice": "...", "recommendations": ["..."] },
    "humorous": { "advice": "...", "recommendations": ["..."] },
    "assertive": { "advice": "...", "recommendations": ["..."] }
  },
  "version": 1,
  "updated_at": "${new Date().toISOString()}"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You optimize tone rewrite prompts for email outreach. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = completion.choices[0]?.message?.content ?? "{}";
    return result;
  } catch (error) {
    console.error("Error tuning rewrite prompt:", error);
    throw error;
  }
}

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY")!,
  });

  try {
    // Fetch recent feedback (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: feedbackRows, error: feedbackError } = await sb
      .from("llm_rewrite_feedback")
      .select("tone, engagement_score, positive_rate, message_count")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .not("tone", "is", null)
      .not("engagement_score", "is", null);

    if (feedbackError) {
      console.error("Error fetching feedback:", feedbackError);
      return new Response(JSON.stringify({ error: feedbackError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!feedbackRows || feedbackRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No feedback data available for tuning" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Group by tone and aggregate
    const toneMap = new Map<string, FeedbackRow>();
    for (const row of feedbackRows) {
      const tone = row.tone as string;
      if (!tone) continue;

      const existing = toneMap.get(tone);
      if (existing) {
        // Weighted average by message_count
        const totalSamples = existing.message_count + row.message_count;
        existing.engagement_score =
          (existing.engagement_score * existing.message_count +
            row.engagement_score * row.message_count) /
          totalSamples;
        existing.positive_rate =
          (existing.positive_rate * existing.message_count +
            row.positive_rate * row.message_count) /
          totalSamples;
        existing.message_count = totalSamples;
      } else {
        toneMap.set(tone, {
          tone,
          engagement_score: row.engagement_score as number,
          positive_rate: row.positive_rate as number,
          message_count: row.message_count as number,
        });
      }
    }

    const aggregatedFeedback = Array.from(toneMap.values());

    // Run tuning
    const tunedJson = await tuneRewritePrompt(openai, aggregatedFeedback);
    let parsedGuidelines;
    try {
      parsedGuidelines = JSON.parse(tunedJson);
    } catch (parseError) {
      console.error("Error parsing tuned guidelines:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse tuned guidelines", raw: tunedJson }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Store in rewrite_guidelines table with pending status
    const guidelines = parsedGuidelines.guidelines || {};
    const insertedIds: string[] = [];

    for (const [tone, data] of Object.entries(guidelines)) {
      if (!["formal", "casual", "humorous", "assertive"].includes(tone)) continue;

      const { data: inserted, error: insertError } = await sb
        .from("rewrite_guidelines")
        .insert({
          tone,
          status: "pending",
          guidelines_json: data,
          version: parsedGuidelines.version || 1,
          notes: `Auto-tuned on ${new Date().toISOString()} based on ${aggregatedFeedback.length} feedback entries`,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`Error inserting guidelines for tone ${tone}:`, insertError);
        continue;
      }

      if (inserted) {
        insertedIds.push(inserted.id);
      }
    }

    // Log to system_logs
    await sb.from("system_logs").insert({
      category: "ai_rewrite_tuning",
      level: "info",
      context: {
        feedback_samples: aggregatedFeedback.length,
        tones_updated: insertedIds.length,
        guideline_ids: insertedIds,
      },
      message: `Rewrite guidelines auto-tuned: ${insertedIds.length} tone(s) updated`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        tones_updated: insertedIds.length,
        guideline_ids: insertedIds,
        guidelines: parsedGuidelines,
      }),
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

