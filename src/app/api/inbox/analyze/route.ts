import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { workspace_id, from_email, subject, body } = await req.json();
    if (!workspace_id || !from_email || !body)
      return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // classify reply
    const prompt = `
    Analyze the following email reply.
    Categorize it as one of: Interested, Not Interested, Follow Up, Out of Office, Unclear.
    Also describe sentiment (Positive, Neutral, Negative).
    Reply in JSON: {classification: "", sentiment: "", follow_up_required: true/false}
    ----
    Subject: ${subject || "(none)"}
    Body:
    ${body}
    `;

    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.choices[0].message?.content || "{}";
    const parsed = JSON.parse(text);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!,
      { cookies: () => new Map() }
    );

    const { data, error } = await supabase
      .from("email_replies")
      .insert({
        workspace_id,
        from_email,
        subject,
        body,
        classification: parsed.classification,
        sentiment: parsed.sentiment,
        follow_up_required: parsed.follow_up_required,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}