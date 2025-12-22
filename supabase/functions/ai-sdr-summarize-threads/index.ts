import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPENAI_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!openaiKey) {
  throw new Error("Missing OPENAI_API_KEY or OPENAI_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiKey });

Deno.serve(async () => {
  try {
    // 1) Find threads that need summary update
    // Select threads where:
    // - auto_summary_enabled = true
    // - summary_updated_at is null OR last_message_at > summary_updated_at (stale)
    const { data: threads, error: threadErr } = await supabase
      .from("ai_sdr_threads")
      .select("id, lead_id, last_message_at, summary_updated_at, auto_summary_enabled")
      .eq("auto_summary_enabled", true)
      .or("summary_updated_at.is.null,last_message_at.gt.summary_updated_at")
      .limit(25); // batch size

    if (threadErr) {
      console.error("Thread fetch error", threadErr);
      return new Response(JSON.stringify({ error: threadErr.message }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    if (!threads || threads.length === 0) {
      return new Response(JSON.stringify({ message: "No threads to summarize", processed: 0 }), { 
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const t of threads) {
      try {
        // Fetch timeline items for this thread
        const { data: timeline, error: tlErr } = await supabase
          .from("ai_sdr_timeline_items")
          .select("*")
          .eq("thread_id", t.id)
          .order("created_at", { ascending: true });

        if (tlErr) {
          console.error("Timeline error for thread", t.id, tlErr);
          errors.push(`Thread ${t.id}: ${tlErr.message}`);
          continue;
        }

        if (!timeline || timeline.length === 0) {
          // No timeline items yet, skip
          continue;
        }

        const systemPrompt = `
You are an SDR manager summarizing a sales conversation thread.

Given a timeline of:
- emails (inbound/outbound)
- AI SDR actions
- meetings

You must return STRICT JSON with:
{
  "summary": string,         // 2-4 short sentences, plain text
  "health_score": number,    // 0-100 (higher = better chance of closing soon)
  "health_label": "hot" | "warm" | "cold"
}

Scoring guidelines:
- "hot" (80-100): clear interest, positive replies, booked or near booking a meeting, active responses.
- "warm" (40-79): some engagement, questions or soft interest, maybe stalled but not dead.
- "cold" (0-39): no replies for long time, clear rejections, or very weak engagement.

Be concise. Do not mention that you are an AI. Do not include any other keys.
`.trim();

        const userPrompt = `
Timeline (chronological JSON array):
${JSON.stringify(timeline ?? [], null, 2)}
`.trim();

        let summary = "";
        let score = 0;
        let label: "hot" | "warm" | "cold" = "cold";

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" }
          });

          const raw = completion.choices[0].message.content ?? "{}";
          const parsed = JSON.parse(raw);

          summary = parsed.summary ?? "";
          score = Number.isFinite(parsed.health_score)
            ? Math.max(0, Math.min(100, Math.round(parsed.health_score)))
            : 0;
          label = parsed.health_label === "hot" || parsed.health_label === "warm"
            ? parsed.health_label
            : "cold";
        } catch (e) {
          console.error("Summarization error for thread", t.id, e);
          errors.push(`Thread ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }

        // Update thread with summary and health score
        const { error: updateErr } = await supabase
          .from("ai_sdr_threads")
          .update({
            summary,
            health_score: score,
            health_label: label,
            summary_updated_at: new Date().toISOString()
          })
          .eq("id", t.id);

        if (updateErr) {
          console.error("Update error for thread", t.id, updateErr);
          errors.push(`Thread ${t.id}: ${updateErr.message}`);
          continue;
        }

        processed++;
      } catch (e) {
        console.error("Error processing thread", t.id, e);
        errors.push(`Thread ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Summaries updated", 
        processed,
        total: threads.length,
        errors: errors.length > 0 ? errors : undefined
      }), 
      { 
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (e) {
    console.error("Fatal error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), 
      { 
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
});


