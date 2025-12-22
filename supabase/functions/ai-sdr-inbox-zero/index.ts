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
    // 1) Fetch threads w/ needed fields
    const { data: threads, error: threadsError } = await supabase
      .from("ai_sdr_threads")
      .select("id, lead_id, health_score, health_label, status, inbox_state, last_message_at")
      .limit(200);

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      return new Response(JSON.stringify({ error: threadsError.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    if (!threads || threads.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: "No threads to process" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const now = Date.now();
    let processed = 0;

    for (const t of threads) {
      try {
        const lastMessageAt = new Date(t.last_message_at).getTime();
        const daysSinceMsg = Math.floor((now - lastMessageAt) / (1000 * 60 * 60 * 24));

        // A. Auto-archive logic
        if (
          t.inbox_state === "active" &&
          t.status !== "closed_won" &&
          t.status !== "closed_lost" &&
          daysSinceMsg >= 14
        ) {
          await supabase
            .from("ai_sdr_threads")
            .update({
              inbox_state: "archived",
              inbox_state_reason: "Auto-archived due to 14 days inactivity",
              inbox_state_updated_at: new Date().toISOString(),
            })
            .eq("id", t.id);

          processed++;
          continue;
        }

        // B. Auto-dismiss logic
        if (
          t.inbox_state === "active" &&
          t.health_score !== null &&
          t.health_score <= 20 &&
          daysSinceMsg >= 21
        ) {
          // Check last 2 AI follow-ups got no reply
          const { data: recentEvents } = await supabase
            .from("ai_sdr_events")
            .select("event_type, created_at")
            .eq("thread_id", t.id)
            .in("event_type", ["send_followup", "revive_lead"])
            .order("created_at", { ascending: false })
            .limit(2);

          if (recentEvents && recentEvents.length >= 2) {
            // Check if there were any inbound messages after the last follow-up
            const lastEventAt = new Date(recentEvents[0].created_at).getTime();
            const { data: inboundAfter } = await supabase
              .from("emails")
              .select("id")
              .eq("lead_id", t.lead_id)
              .eq("is_incoming", true)
              .gt("created_at", new Date(lastEventAt).toISOString())
              .limit(1);

            if (!inboundAfter || inboundAfter.length === 0) {
              await supabase
                .from("ai_sdr_threads")
                .update({
                  inbox_state: "dismissed",
                  inbox_state_reason: "Auto-dismiss: cold, no replies, dead thread",
                  inbox_state_updated_at: new Date().toISOString(),
                })
                .eq("id", t.id);

              processed++;
              continue;
            }
          }
        }

        // C. Auto-mute logic — check last inbound
        const { data: inbound } = await supabase
          .from("emails")
          .select("*")
          .eq("lead_id", t.lead_id)
          .eq("is_incoming", true)
          .order("created_at", { ascending: false })
          .limit(1);

        if (inbound && inbound.length > 0) {
          const latest = inbound[0];
          const bodyText = latest.body_text || latest.body_html || "";

          if (bodyText.trim().length > 0) {
            // Use AI classifier
            const system = `
Classify this email into one category:

- "not_interested"
- "wrong_person"
- "bounce"
- "forwarded"
- "neutral"
- "positive_interest"

Return ONLY the label.
            `.trim();

            try {
              const cls = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: bodyText.substring(0, 2000) }, // Limit length
                ],
              });

              const label = cls.choices[0]?.message?.content?.trim()?.toLowerCase() ?? "neutral";

              if (label.includes("not_interested") || label.includes("wrong_person")) {
                await supabase
                  .from("ai_sdr_threads")
                  .update({
                    inbox_state: "muted",
                    inbox_state_reason: `Auto-muted (${label})`,
                    inbox_state_updated_at: new Date().toISOString(),
                  })
                  .eq("id", t.id);

                processed++;
                continue;
              }
            } catch (aiError) {
              console.error(`AI classification error for thread ${t.id}:`, aiError);
              // Continue to next logic if AI fails
            }
          }
        }

        // D. Auto-prioritize HOT
        if (t.health_label === "hot" && t.inbox_state !== "active") {
          await supabase
            .from("ai_sdr_threads")
            .update({
              inbox_state: "active",
              inbox_state_reason: "Auto-prioritize: hot lead",
              inbox_state_updated_at: new Date().toISOString(),
            })
            .eq("id", t.id);

          processed++;
          continue;
        }
      } catch (error) {
        console.error(`Error processing thread ${t.id}:`, error);
        // Continue with next thread
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        message: "Inbox Zero pass complete",
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Inbox Zero error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});


