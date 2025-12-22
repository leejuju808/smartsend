import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { message_id } = await req.json();

    if (!message_id) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    // Get the message content
    const { data: msg, error: msgError } = await supabase
      .from("inbox_messages")
      .select("body, thread_id")
      .eq("id", message_id)
      .maybeSingle();

    if (msgError || !msg) {
      return NextResponse.json({ error: "message not found" }, { status: 404 });
    }

    // Check if we already have a draft for this message
    const { data: existingDraft } = await supabase
      .from("inbox_ai_drafts")
      .select("draft")
      .eq("message_id", message_id)
      .maybeSingle();

    if (existingDraft) {
      return NextResponse.json({ draft: existingDraft.draft });
    }

    // Generate AI draft
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // fast, cost-efficient
      messages: [
        { 
          role: "system", 
          content: "You are a helpful sales assistant. Draft short, professional, friendly replies to prospects. Keep responses under 100 words, be conversational, and show genuine interest in helping them." 
        },
        { 
          role: "user", 
          content: `Prospect message: ${msg.body}` 
        }
      ],
      max_tokens: 250,
      temperature: 0.7,
    });

    const draft = completion.choices[0]?.message?.content?.trim() || "";

    if (!draft) {
      return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
    }

    // Store the draft in the database
    const { data: savedDraft, error: saveError } = await supabase
      .from("inbox_ai_drafts")
      .insert({
        thread_id: msg.thread_id,
        message_id,
        draft
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save AI draft:", saveError);
      // Still return the draft even if saving fails
      return NextResponse.json({ draft });
    }

    return NextResponse.json({ draft: savedDraft?.draft || draft });
  } catch (error) {
    console.error("AI Draft API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 