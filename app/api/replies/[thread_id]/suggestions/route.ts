import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ thread_id: string }> }
) {
  try {
    const { thread_id } = await params;
    const supabase = createClient();

    // Get all messages for this thread
    const { data: messages, error } = await supabase
      .from("messages")
      .select("direction, body_text, body_html, body")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages found" }, { status: 404 });
    }

    // Build transcript
    const transcript = messages
      .map((m) => {
        const body = m.body_text || m.body_html || m.body || "";
        const direction = m.direction === "incoming" || m.direction === "inbound" ? "Prospect" : "You";
        return `${direction}: ${body}`;
      })
      .join("\n\n");

    // Call OpenAI to generate suggestions
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps draft professional email replies for sales conversations.
Generate 3 short reply options based on the email thread. Make them:
- Friendly but professional
- 2-4 sentences max
- Optimized for conversion or booking a meeting
- Natural and conversational

Return ONLY a JSON array of strings, no other text. Example: ["Reply option 1", "Reply option 2", "Reply option 3"]`,
        },
        {
          role: "user",
          content: `Based on this email thread, draft 3 short reply options:\n\n${transcript}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(responseText);
    
    // Handle different response formats
    let suggestions: string[] = [];
    if (Array.isArray(parsed.suggestions)) {
      suggestions = parsed.suggestions;
    } else if (Array.isArray(parsed)) {
      suggestions = parsed;
    } else if (typeof parsed === "object") {
      // Try to find suggestions in the object
      suggestions = parsed.suggestions || parsed.replies || Object.values(parsed).filter(v => typeof v === "string") as string[];
    }

    // Ensure we have exactly 3 suggestions
    if (suggestions.length === 0) {
      suggestions = [
        "Thanks for your message! I'd love to learn more about your needs.",
        "I appreciate you reaching out. When would be a good time to connect?",
        "Thank you for the information. Let me know if you have any questions.",
      ];
    } else if (suggestions.length > 3) {
      suggestions = suggestions.slice(0, 3);
    }

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error("Error generating suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}










