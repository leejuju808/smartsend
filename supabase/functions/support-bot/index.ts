// Support Bot Edge Function
// AI-powered support ticket triage and summarization

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

Deno.serve(async (req) => {
  try {
    // Fetch all open tickets
    const { data: tickets, error: ticketsError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(50); // Process up to 50 tickets per run

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      return new Response(
        JSON.stringify({ ok: false, error: ticketsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!tickets || tickets.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No open tickets to triage", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const ticket of tickets) {
      try {
        // Generate AI summary and priority suggestion
        const prompt = `Analyze this customer support ticket and provide:
1. A brief summary (2-3 sentences)
2. Priority level (low, normal, high, urgent)
3. Suggested next action

Subject: ${ticket.subject}
Message: ${ticket.message}

Respond in JSON format:
{
  "summary": "...",
  "priority": "low|normal|high|urgent",
  "next_action": "..."
}`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const responseText = completion.choices[0]?.message?.content;
        if (!responseText) {
          console.error(`No response for ticket ${ticket.id}`);
          errors++;
          continue;
        }

        const analysis = JSON.parse(responseText);
        const priority = analysis.priority || (responseText.toLowerCase().includes("urgent") ? "high" : "normal");

        // Update ticket with AI analysis
        const { error: updateError } = await supabase
          .from("support_tickets")
          .update({
            status: "triaged",
            priority: priority,
            ai_summary: analysis.summary || null,
            next_action: analysis.next_action || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticket.id);

        if (updateError) {
          console.error(`Error updating ticket ${ticket.id}:`, updateError);
          errors++;
        } else {
          processed++;
          console.log(`Triaged ticket ${ticket.id} with priority ${priority}`);
        }
      } catch (error) {
        console.error(`Error processing ticket ${ticket.id}:`, error);
        errors++;
      }
    }

    // Optionally send Slack/Discord notification
    const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackWebhook && processed > 0) {
      try {
        await fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🤖 Support Bot: Triaged ${processed} ticket(s). ${errors > 0 ? `${errors} errors.` : ""}`,
          }),
        });
      } catch (webhookError) {
        console.error("Error sending Slack notification:", webhookError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Support tickets triaged",
        processed,
        errors,
        total: tickets.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in support-bot:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

