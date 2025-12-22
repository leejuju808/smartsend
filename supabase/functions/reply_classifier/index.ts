// supabase/functions/reply_classifier/index.ts
// Block 21555 — Reply Classifier v1
// AI analyzes homeowner replies and returns intent, pipeline stage, and task recommendations

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve({
  "/": async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);

    if (!body || !body.message) {
      return new Response("Missing message", { status: 400 });
    }

    const prompt = `
You classify homeowner replies for a roofing company CRM.

Classify the reply into:

intent:
- hot_lead (wants estimate / wants someone to visit / wants quote)
- warm_lead (interested but vague)
- question (they ask for info)
- not_interested
- out_of_scope
- autoresponder
- spam_noise

pipeline_stage:
- replied
- interested
- estimate_scheduled
- estimate_completed
- verbal_yes
- contract_sent
- won
- lost

task_recommendation:
- "call_homeowner"
- "respond_with_info"
- "send_booking_link"
- "mark_lost"
- "none"

Return JSON ONLY:

{
  "intent": "",
  "pipeline_stage": "",
  "task_recommendation": "",
  "summary": ""
}

Homeowner message:

${body.message}
    `;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("OpenAI error:", txt);
      return new Response("OpenAI error", { status: 500 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";

    return new Response(raw, {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  },
});














































