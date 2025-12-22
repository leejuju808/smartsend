import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request, { params }: { params: { thread_id: string } }) {
  const supabase = createClient();

  const { data: messages, error } = await supabase
    .from("messages")
    .select("direction, body_text, body")
    .eq("thread_id", params.thread_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No messages found" }, { status: 404 });
  }

  const transcript = messages
    .map((m) => {
      const body = m.body_text || m.body || "";
      return `${m.direction === "incoming" ? "Prospect" : "You"}: ${body}`;
    })
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes email reply threads in 3 bullet points. Focus on intent, next steps, and tone.",
        },
        {
          role: "user",
          content: `Summarize the following email reply thread in 3 bullet points. Focus on intent, next steps, tone:\n\n${transcript}`,
        },
      ],
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content || "Unable to generate summary.";

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}










