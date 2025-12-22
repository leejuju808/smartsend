import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const { previousEmail, goal, tone = "neutral" } = await req.json();
  const messages = [
    { role: "system", content:
      "Write a concise follow-up to a previous cold email. 2–4 sentences, one soft CTA, no guilt-tripping. Preserve merge tags and links." },
    { role: "user", content:
      `Previous email:\n"""${previousEmail}"""\nGoal of follow-up: ${goal || "check interest"}\nTone: ${tone}` }
  ];
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages, temperature: 0.5 });
  const text = r.choices[0].message?.content?.trim() || "";
  return NextResponse.json({ text });
}


