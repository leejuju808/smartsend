import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.0.0";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

  try {
    const { messageBody, lead_id, campaign_id } = await req.json();

    const aiCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI that checks if an email is a reply from a human. Return only 'replied' or 'not replied'.",
        },
        { role: "user", content: messageBody },
      ],
    });

    const result = aiCheck.choices[0].message.content.trim().toLowerCase();

    if (result.includes("replied")) {
      await supabase
        .from("leads")
        .update({ status: "replied", replied_at: new Date().toISOString() })
        .eq("id", lead_id);

      await supabase
        .from("campaign_logs")
        .insert({ 
          lead_id, 
          campaign_id: campaign_id || null,
          event_type: "ai_reply_detected",
          details: { message_body: messageBody, ai_result: result }
        });
    }

    return new Response(JSON.stringify({ status: result }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Error in reply detection", { status: 500 });
  }
});
