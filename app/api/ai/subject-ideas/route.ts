import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const { context, base, variantCount = 5 } = await req.json();
  const n = Math.min(Math.max(Number(variantCount) || 5, 1), 10);
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      { role: "system", content: "You write concise, non-spammy subject lines for cold email." },
      { role: "user", content:
        `Write ${n} subject lines <= 45 chars, no emojis or spammy words.
Context: ${context || "SMB outreach"}
Base (optional): ${base || "n/a"}
Respond as a plain list, one per line.` }
    ],
  });
  const text = resp.choices[0].message?.content || "";
  const ideas = text.split("\n").map(s => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  return NextResponse.json({ ideas });
}


