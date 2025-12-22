// deno-lint-ignore-file no-explicit-any
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Pull recent inbound messages + events
    const { data: msgs } = await supabase
      .from("email_messages")
      .select("body_text, direction, sent_at")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(5);

    const { data: events } = await supabase
      .from("email_events")
      .select("event_type, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const textSample =
      (msgs || [])
        .filter((m) => m.direction === "in")
        .map((m) => m.body_text)
        .join("\n\n") || "No inbound messages.";

    const eventSummary = (events || [])
      .map((e) => `${e.event_type} at ${e.created_at}`)
      .join(", ") || "No events recorded.";

    const prompt = `
You are SmartSend's AI engagement analyst.

Given the recent lead messages and activity log, produce a short summary (max 3 sentences) describing the lead's interest level, tone, and engagement.

Then classify sentiment as positive, neutral, or negative.

Messages:

${textSample}

Events:

${eventSummary}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const output = response.choices[0].message?.content?.trim() || "";
    const sentimentMatch = output.match(/(positive|neutral|negative)/i);
    const sentiment = sentimentMatch
      ? sentimentMatch[1].toLowerCase()
      : "neutral";

    // Get org_id from lead (if column exists)
    let org_id: string | null = null;
    try {
      const { data: lead } = await supabase
        .from("leads")
        .select("org_id")
        .eq("id", lead_id)
        .maybeSingle();
      org_id = lead?.org_id || null;
    } catch (e) {
      // org_id column might not exist, that's okay
      console.log("Could not fetch org_id:", e);
    }

    // 2) Store summary
    const { error: insertError } = await supabase.from("lead_activity").insert({
      lead_id,
      org_id: org_id,
      type: "summary",
      summary: output,
      sentiment,
    });

    if (insertError) {
      console.error("Error inserting lead activity:", insertError);
      // Continue anyway, return the summary
    }

    return new Response(
      JSON.stringify({ summary: output, sentiment }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Error in ai-lead-summary:", e);
    return new Response(
      JSON.stringify({ error: e.toString() }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

