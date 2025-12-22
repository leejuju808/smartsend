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
    // 1. Select threads that need update
    // - next_best_action_generated_at is null OR
    // - last_message_at > next_best_action_generated_at (stale)
    const { data: threads, error: threadErr } = await supabase
      .from("ai_sdr_threads")
      .select("id, lead_id, campaign_id, summary, health_score, last_message_at, next_best_action_generated_at")
      .or("next_best_action_generated_at.is.null,last_message_at.gt.next_best_action_generated_at")
      .limit(25);

    if (threadErr) {
      console.error("Thread fetch error", threadErr);
      return new Response(JSON.stringify({ error: threadErr.message }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    if (!threads || threads.length === 0) {
      return new Response(JSON.stringify({ message: "No threads for NBM", processed: 0 }), { 
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const t of threads) {
      try {
        // 2. Fetch timeline
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

        // 3. Fetch campaign + playbook + user_settings
        let userSettings = null;
        let campaign = null;
        let playbook = null;

        if (t.campaign_id) {
          const { data: camp } = await supabase
            .from("campaigns")
            .select("id, name, user_id, ai_sdr_playbook_id")
            .eq("id", t.campaign_id)
            .maybeSingle();

          campaign = camp;

          if (camp?.user_id) {
            const { data: settings } = await supabase
              .from("user_settings")
              .select("*")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            userSettings = settings;
          }

          if (camp?.ai_sdr_playbook_id) {
            const { data: pb } = await supabase
              .from("ai_sdr_playbooks")
              .select("*")
              .eq("id", camp.ai_sdr_playbook_id)
              .maybeSingle();
            playbook = pb;
          }
        }

        const system = `
You are a world-class SDR manager generating Next Best Actions.

User/company context:
${JSON.stringify({ userSettings, campaign, playbook }, null, 2)}

Given:
- the full timeline of the thread
- the current summary
- the health score (0–100)

Your job:
Infer the ***Next Best Actions***.

Consider the playbook's approach style (${playbook?.approach_style ?? "balanced"}) when recommending actions:
- "soft": Be gentle, patient, less pushy
- "balanced": Standard SDR best practices
- "direct": More assertive, faster to close or disqualify

Return STRICT JSON:

{
  "primary_action": "send_followup" | "push_meeting" | "send_resource" | "wait" | "close_won" | "close_lost" | "pause",
  "primary_label": string,
  "primary_reason": string,

  "ranked_options": [
    { "action": "...", "label": "...", "score": number },
    ...
  ]
}

Instructions:
- Be decisive.
- Keep labels short.
- Reason should be one sentence.
- Score 0–100: higher = more recommended.
`.trim();

        const user = `
SUMMARY:
${t.summary ?? ""}

HEALTH SCORE:
${t.health_score ?? 0}

TIMELINE:
${JSON.stringify(timeline ?? [], null, 2)}
`.trim();

        let parsed;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user }
            ],
            response_format: { type: "json_object" }
          });

          const raw = completion.choices[0].message.content ?? "{}";
          parsed = JSON.parse(raw);
        } catch (e) {
          console.error("NBM parse error for thread", t.id, e);
          errors.push(`Thread ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }

        // Update thread with NBM
        const { error: updateErr } = await supabase
          .from("ai_sdr_threads")
          .update({
            next_best_action: parsed.primary_action ?? null,
            next_best_action_reason: parsed.primary_reason ?? null,
            next_best_action_options: parsed.ranked_options ?? [],
            next_best_action_generated_at: new Date().toISOString()
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
        message: "NBM updated", 
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

