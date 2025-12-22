// Block 200 — AI Auto-Tagging Rules v1
// Edge function to classify incoming message intent

import OpenAI from "npm:openai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { thread_id, body } = await req.json();

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use empty string if body is missing
    const messageBody = body || "";

    const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Classify the intent using OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Classify the prospect's reply into ONE label:

"meeting_intent" → Wants a call/meeting, scheduling talk
"interested" → Positive but not scheduling yet
"not_interested" → Declines
"referral" → Redirects to someone else
"question" → Asks for more info
"out_of_office" → OoO auto response
"unsubscribe" → Wants to opt out
"other" → Doesn't fit above

Return ONLY the label, nothing else.`,
        },
        {
          role: "user",
          content: `Reply text:\n\n${messageBody}`,
        },
      ],
      temperature: 0.0,
      max_tokens: 20,
    });

    const label = completion.choices[0]?.message?.content?.trim().toLowerCase() || "other";

    // Validate label is one of the allowed values
    const validLabels = [
      "meeting_intent",
      "interested",
      "not_interested",
      "referral",
      "question",
      "out_of_office",
      "unsubscribe",
      "other",
    ];

    const intent = validLabels.includes(label) ? label : "other";

    // Update the reply_threads table with intent
    const { error } = await supabase
      .from("reply_threads")
      .update({ intent_primary: intent })
      .eq("id", thread_id);

    if (error) {
      console.error("Error updating intent:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update intent", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Auto-close thread for certain intents (Block 203)
    if (["not_interested", "unsubscribe", "referral"].includes(intent)) {
      const { error: closeError } = await supabase
        .from("reply_threads")
        .update({ state: "closed" })
        .eq("id", thread_id);

      if (closeError) {
        console.error("Error auto-closing thread:", closeError);
        // Don't fail the request, just log the error
      }
    }

    return new Response(
      JSON.stringify({ intent }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-intent-classifier:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

