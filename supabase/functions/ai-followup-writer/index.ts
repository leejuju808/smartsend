import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async () => {
  try {
    // Find threads with no reply in 3+ days that are still open
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: stale, error: staleError } = await supabase
      .from("threads")
      .select("id, org_id, lead_email, subject, last_message_at, lead_id")
      .lte("last_message_at", threeDaysAgo)
      .eq("status", "open")
      .limit(100);

    if (staleError) {
      console.error("Error fetching stale threads:", staleError);
      return new Response(
        JSON.stringify({ error: staleError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!stale || stale.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, generated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let generated = 0;
    const errors: string[] = [];

    for (const t of stale) {
      try {
        // Skip if there's already a pending follow-up for this thread
        const { data: existing } = await supabase
          .from("ai_followup_queue")
          .select("id")
          .eq("thread_id", t.id)
          .in("status", ["pending", "approved"])
          .maybeSingle();

        if (existing) {
          console.log(`Skipping thread ${t.id}: already has pending follow-up`);
          continue;
        }

        // Get all messages in the thread for context
        const { data: msgs, error: msgsError } = await supabase
          .from("messages")
          .select("body_text, direction, sent_at")
          .eq("thread_id", t.id)
          .order("sent_at", { ascending: true });

        if (msgsError) {
          console.error(`Error fetching messages for thread ${t.id}:`, msgsError);
          errors.push(`Thread ${t.id}: ${msgsError.message}`);
          continue;
        }

        // Build context from messages
        const context = msgs?.map((m) => {
          const label = m.direction === "inbound" ? "Lead" : "You";
          return `${label}: ${m.body_text || "(no text)"}`;
        }).join("\n\n") || "No messages yet";

        // Get campaign goal if available
        let campaignGoal = "re-engage the lead";
        if (t.lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("campaign_id")
            .eq("id", t.lead_id)
            .maybeSingle();
          
          if (lead?.campaign_id) {
            const { data: campaign } = await supabase
              .from("campaigns")
              .select("goal")
              .eq("id", lead.campaign_id)
              .maybeSingle();
            
            if (campaign?.goal) {
              campaignGoal = campaign.goal;
            }
          }
        }

        // Generate AI prompt
        const prompt = `You are SmartSend's AI follow-up writer. Based on this conversation, draft a friendly, brief follow-up email (max 100 words) that re-engages the lead. 

Context:
${context}

Campaign goal: ${campaignGoal}

Write a natural, conversational follow-up that:
- References something from the conversation
- Is brief and doesn't sound automated
- Encourages the lead to respond or take action
- Matches the tone of the previous conversation`;

        // Call OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const draft = completion.choices[0].message?.content?.trim() || "";

        if (!draft) {
          console.error(`No draft generated for thread ${t.id}`);
          errors.push(`Thread ${t.id}: No draft generated`);
          continue;
        }

        // Schedule for 12 hours later
        const scheduledFor = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

        // Insert into queue
        const { error: insertError } = await supabase.from("ai_followup_queue").insert({
          org_id: t.org_id,
          thread_id: t.id,
          lead_id: t.lead_id || null,
          ai_prompt: prompt,
          ai_draft: draft,
          scheduled_for: scheduledFor,
          status: "pending",
        });

        if (insertError) {
          console.error(`Error inserting follow-up for thread ${t.id}:`, insertError);
          errors.push(`Thread ${t.id}: ${insertError.message}`);
          continue;
        }

        generated++;
      } catch (error) {
        console.error(`Error processing thread ${t.id}:`, error);
        errors.push(`Thread ${t.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        generated,
        total_checked: stale.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-followup-writer:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

