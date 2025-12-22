import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { topic } = await req.json();
  const prompt = `Write a short, high-converting cold email about: ${topic}. Include a catchy subject line and professional tone.`;
  
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  const text = completion.choices[0].message.content || "";
  const [subjectLine, ...rest] = text.split("\n");
  return NextResponse.json({ subject: subjectLine.replace("Subject:", "").trim(), body: rest.join("\n").trim() });
}