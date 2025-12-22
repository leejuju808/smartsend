import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { reply_id, workspace_id } = await req.json();
    if (!reply_id || !workspace_id)
      return NextResponse.json({ error: "Missing reply_id or workspace_id" }, { status: 400 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!,
      { cookies: () => new Map() }
    );

    const { data: reply, error } = await supabase
      .from("email_replies")
      .select("*")
      .eq("id", reply_id)
      .single();
    if (error || !reply) throw new Error("Reply not found");

    const prompt = `
You are SmartSend's Follow-Up AI. Draft a short professional follow-up email responding to this message.
The goal is to move the conversation forward respectfully.
Reply context:
From: ${reply.from_email}
Classification: ${reply.classification}
Sentiment: ${reply.sentiment}
Message:
${reply.body}

Respond as a polite sender, maintaining tone consistency.
Output JSON: {subject: "", body: ""}.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const json = JSON.parse(completion.choices[0].message?.content || "{}");

    const { data: draft, error: insertErr } = await supabase
      .from("followup_drafts")
      .insert({
        reply_id,
        workspace_id,
        draft_subject: json.subject || "Follow-up",
        draft_body: json.body || "",
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true, draft });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}