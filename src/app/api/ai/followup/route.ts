import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { thread_id, tone = "professional", goal = "follow_up" } = await req.json();

  if (!OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  if (!thread_id) return NextResponse.json({ error: "Missing thread_id" }, { status: 400 });

  // Fetch last 2 messages (outbound + inbound)
  // Try both thread_id (UUID) and thread_key (string) for compatibility
  const { data: msgs, error } = await supabase
    .from("inbox_messages")
    .select("direction, subject, body_text, body_html, received_at, sent_at")
    .or(`thread_id.eq.${thread_id},thread_key.eq.${thread_id}`)
    .order("received_at", { ascending: false })
    .limit(2);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map to the format expected by the prompt
  const history = (msgs || []).map(
    (m) => `[${m.direction}] ${m.subject || ""}\n${m.body_text || m.body_html || ""}`
  ).join("\n---\n");

  const prompt = [
    "You are an assistant that drafts concise, natural B2B follow-ups.",
    `Tone: ${tone}`,
    `Goal: ${goal}`,
    "Reply to the thread in a way that feels human and moves the conversation forward.",
    "Do NOT repeat previous content. No emojis or formatting.",
    "Limit to 120 words.",
    "---",
    "Thread so far:",
    history,
    "---",
    "Draft the next outbound follow-up email only."
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [{ role: "system", content: "You write one realistic follow-up email." }, { role: "user", content: prompt }]
    }),
  });

  if (!r.ok) {
    const errorText = await r.text();
    return NextResponse.json({ error: `OpenAI API error: ${errorText}` }, { status: r.status });
  }

  const j = await r.json();
  const draft = j.choices?.[0]?.message?.content?.trim() || "";

  return NextResponse.json({ draft });
}

