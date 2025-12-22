import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { reply_id, workspace_id, lead_id, tone, cta, product_context, original_message } = await req.json();

    if (!reply_id || !workspace_id || !lead_id || !original_message) {
      return NextResponse.json(
        { error: "Missing required fields: reply_id, workspace_id, lead_id, original_message" },
        { status: 400 }
      );
    }

    // Fetch lead information for context
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("email, first_name, last_name, company, title, notes")
      .eq("id", lead_id)
      .single();

    if (leadError && leadError.code !== "PGRST116") {
      console.error("Error fetching lead:", leadError);
    }

    // Fetch reply details if needed
    const { data: reply } = await supabase
      .from("email_replies")
      .select("subject, body, from_email")
      .eq("id", reply_id)
      .single();

    // Build context for AI
    const leadName = lead
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
      : reply?.from_email || "Customer";

    const company = lead?.company || "";
    const title = lead?.title || "";
    const notes = lead?.notes || "";

    const systemPrompt = [
      "You are SmartSend's AI reply assistant. Draft short, professional, friendly replies to prospects.",
      "Keep responses under 150 words, be conversational, and show genuine interest in helping them.",
      "Maintain the specified tone throughout the message.",
    ].join("\n");

    const userPrompt = [
      `Prospect message:`,
      original_message || reply?.body || "",
      ``,
      `Context:`,
      `- Recipient: ${leadName}${company ? ` (${company})` : ""}${title ? `, ${title}` : ""}`,
      product_context ? `- Product/Service: ${product_context}` : "",
      notes ? `- Notes: ${notes}` : "",
      ``,
      `Requirements:`,
      `- Tone: ${tone || "professional"}`,
      cta ? `- Include a clear CTA: ${cta}` : "",
      `- Respond naturally to their message`,
      `- Keep it concise (under 150 words)`,
      ``,
      `Output only the reply body text, no subject line.`,
    ]
      .filter(Boolean)
      .join("\n");

    // Generate draft using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const draft = completion.choices[0]?.message?.content?.trim() || "";

    if (!draft) {
      return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
    }

    // Optionally save draft to database for history
    let draftId: string | null = null;
    try {
      const { data: savedDraft, error: saveError } = await supabase
        .from("reply_drafts")
        .insert({
          reply_id,
          workspace_id,
          lead_id,
          draft_body: draft,
          tone: tone || "professional",
          cta: cta || null,
          product_context: product_context || null,
        })
        .select("id")
        .single();

      if (!saveError && savedDraft) {
        draftId = savedDraft.id;
      }
    } catch (dbError) {
      // Non-fatal: continue even if draft saving fails
      console.error("Error saving draft to database:", dbError);
    }

    return NextResponse.json({
      draft,
      body: draft, // Alias for compatibility
      draft_id: draftId,
    });
  } catch (error: any) {
    console.error("Error generating reply draft:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate draft" },
      { status: 500 }
    );
  }
}

