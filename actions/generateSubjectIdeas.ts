"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface SubjectIdeaParams {
  campaignId?: string;
  baseSubject?: string;
  contextBody?: string;
  tone?: "casual" | "professional" | "direct" | "playful";
  goal?: "more_replies" | "more_opens";
}

export async function generateSubjectIdeas({
  campaignId,
  baseSubject = "",
  contextBody = "",
  tone = "professional",
  goal = "more_opens",
}: SubjectIdeaParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const prompt = `
You are SmartSend AI. Generate 5 strong cold email subject lines.

Tone: ${tone}
Goal: ${goal}
Base subject (optional): "${baseSubject}"
Email context:
"${contextBody}"

Return JSON:
{
  "subjects": [
    "...",
    "...",
    "...",
    "...",
    "..."
  ]
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const json = JSON.parse(completion.choices[0].message.content || "{}");
  const subjects: string[] = json.subjects || [];

  // no logging needed, but you could log here too if you want
  return { subjects };
}


































































