"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type RewriteTarget = "subject" | "body";

interface RewriteParams {
  campaignId?: string;
  stepPosition?: number | null;
  text: string;
  target: RewriteTarget;
  tone?: "casual" | "professional" | "direct" | "playful";
  goal?: "more_replies" | "shorter" | "clearer" | "warmer";
}

export async function rewriteTemplate({
  campaignId,
  stepPosition = null,
  text,
  target,
  tone = "professional",
  goal = "more_replies",
}: RewriteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const prompt = `
You are SmartSend AI, an assistant that rewrites cold email ${
    target === "subject" ? "subject lines" : "bodies"
  }.

Context:
- Audience: business owners / decision makers.
- Channel: cold email.
- Tone: ${tone}.
- Goal: ${goal}.

Rewrite the following ${target} to improve performance while keeping the core idea the same.

Original:
"${text}"

Return ONLY a JSON object like:
{
  "rewritten": "...your new version..."
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const json = JSON.parse(completion.choices[0].message.content || "{}");
  const rewritten = json.rewritten || text;

  // Log it (optional but nice)
  await supabase.from("smartsend_ai_rewrite_logs").insert({
    user_id: user.id,
    campaign_id: campaignId ?? null,
    step_position: stepPosition,
    target,
    tone,
    goal,
    original_text: text,
    rewritten_text: rewritten,
  });

  return { rewritten };
}


































































