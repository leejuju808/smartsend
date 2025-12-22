// supabase/functions/generate-followup/index.ts
// Block 186: Autonomous Follow-Up Brain - AI Follow-Up Generator

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    // 1. Fetch all threads needing follow-up
    const { data: threads, error: threadsError } = await supabase
      .from("reply_threads")
      .select(`
        *,
        leads(*),
        campaigns(*)
      `)
      .eq("status", "open");

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      return new Response(JSON.stringify({ error: threadsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!threads || threads.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const t of threads) {
      try {
        // ONLY follow-up if campaign allows
        if (!t.campaigns?.auto_followup) {
          skipped++;
          continue;
        }

        // Safety: no follow-up for unsubscribe/bounce/negative tone
        if (
          t.ai_category === "unsubscribe" ||
          t.ai_category === "bounce" ||
          t.ai_tone === "negative"
        ) {
          skipped++;
          continue;
        }

        // Block 369: Check if lead has stop_followups flag set
        const { data: leadData } = await supabase
          .from("leads")
          .select("stop_followups")
          .eq("id", t.lead_id)
          .maybeSingle();

        if (leadData?.stop_followups) {
          skipped++;
          continue; // Lead has requested to stop followups
        }

        // Check if we already have a pending follow-up for this thread
        const { data: existingFollowup } = await supabase
          .from("send_queue")
          .select("id")
          .eq("campaign_id", t.campaign_id)
          .eq("lead_id", t.lead_id)
          .eq("step_number", 999)
          .in("status", ["pending", "waiting_approval", "sending"])
          .maybeSingle();

        if (existingFollowup) {
          skipped++;
          continue; // Already has a follow-up queued
        }

        // Generate follow-up via LLM
        const prompt = `
You are SmartSend AI Follow-Up Engine.
Generate a personalized follow-up email based on the conversation context.

Information:
- Lead Name: ${t.leads?.name || "Valued Contact"}
- Thread Summary: ${t.ai_summary || "No summary available"}
- Tone: ${t.ai_tone || "neutral"}
- Objections: ${JSON.stringify(t.ai_objections || [])}
- Buyer Role: ${t.ai_buyer_role || "unknown"}
- Opportunity Score: ${t.ai_opportunity_score || 0}/10
- Category: ${t.ai_category || "unclassified"}

Write a professional, personalized follow-up email that:
1. Acknowledges the previous conversation
2. Addresses any objections or concerns mentioned
3. Provides value and moves the conversation forward
4. Maintains a ${t.ai_tone || "neutral"} tone
5. Is concise and action-oriented

Output JSON only:
{
  "subject": "Re: [original subject or relevant follow-up subject]",
  "body": "Personalized email body in HTML format"
}
        `;

        const res = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a professional email follow-up generator. Return valid JSON only, no markdown formatting." },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        });

        const content = res.choices[0]?.message?.content;
        if (!content) {
          console.error("No content from OpenAI");
          continue;
        }

        // Parse JSON (handle markdown code blocks if present)
        let follow: { subject: string; body: string };
        try {
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          follow = JSON.parse(cleaned);
        } catch (parseError) {
          console.error("Failed to parse OpenAI response:", parseError, content);
          continue;
        }

        if (!follow.subject || !follow.body) {
          console.error("Invalid follow-up structure:", follow);
          continue;
        }

        // Get campaign's mailbox_id/account_id for send_queue
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("mailbox_id, account_id, user_id")
          .eq("id", t.campaign_id)
          .maybeSingle();

        if (!campaign) {
          console.error("Campaign not found:", t.campaign_id);
          continue;
        }

        // Get lead email
        const { data: lead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", t.lead_id)
          .maybeSingle();

        if (!lead?.email) {
          console.error("Lead email not found:", t.lead_id);
          continue;
        }

        // Determine status based on approval requirement
        const status = t.campaigns.followup_approval_required
          ? "waiting_approval"
          : "pending";

        // Insert into send_queue
        const { error: queueError } = await supabase.from("send_queue").insert({
          campaign_id: t.campaign_id,
          lead_id: t.lead_id,
          step_number: 999, // reserved ID for auto follow-ups
          step_no: 999, // also set step_no for compatibility
          status: status,
          payload: {
            subject: follow.subject,
            body: follow.body,
            auto_followup: true,
            thread_id: t.id,
          },
          subject: follow.subject,
          body_html: follow.body,
          to_email: lead.email,
          scheduled_at: new Date().toISOString(), // Schedule immediately if approved, or wait for approval
          mailbox_id: campaign.mailbox_id || null,
          account_id: campaign.account_id || campaign.user_id || t.account_id || null,
        });

        if (queueError) {
          console.error("Error inserting follow-up into queue:", queueError);
          continue;
        }

        // Log it
        await supabase.from("activity_log").insert({
          account_id: t.account_id,
          campaign_id: t.campaign_id,
          lead_id: t.lead_id,
          company_id: t.company_id || null,
          event_type: "scheduler_dispatch",
          meta: {
            auto_followup_generated: true,
            thread_id: t.id,
            requires_approval: t.campaigns.followup_approval_required,
          },
        });

        processed++;
      } catch (error) {
        console.error(`Error processing thread ${t.id}:`, error);
        // Continue to next thread
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        skipped,
        total: threads.length,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Fatal error in generate-followup:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

