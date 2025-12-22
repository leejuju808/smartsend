// Block 216 — Reply Inbox Smart Actions v1
// AI-powered field extraction from prospect replies

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  try {
    const { thread_id, lead_id, text } = await req.json();

    if (!thread_id || !text) {
      return new Response(
        JSON.stringify({ error: "thread_id and text are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Call OpenAI for extraction
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that extracts structured information from emails.
Extract the following fields and return ONLY valid JSON:
- meeting_times: array of proposed date/times in ISO 8601 format (e.g., ["2024-01-15T14:00:00Z"])
- phone: phone number if provided (format: +1234567890)
- linkedin: LinkedIn profile URL if present
- website: any URL that looks like a personal/company website
- signature: block of text at the end that looks like a signature (as JSON object with keys like name, title, company, etc.)

If a field is not found, use null. Return only the JSON object, no other text.`,
        },
        {
          role: "user",
          content: `Extract information from this email:\n\n${text}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(responseText);

    // Normalize meeting_times to array
    let meetingTimes = parsed.meeting_times;
    if (typeof meetingTimes === "string") {
      try {
        meetingTimes = JSON.parse(meetingTimes);
      } catch {
        meetingTimes = null;
      }
    }
    if (!Array.isArray(meetingTimes)) {
      meetingTimes = null;
    }

    // 2. Insert or update ai_extracted_fields
    const { error: insertError } = await supabase
      .from("ai_extracted_fields")
      .upsert(
        {
          thread_id,
          lead_id: lead_id || null,
          meeting_times: meetingTimes,
          phone: parsed.phone || null,
          linkedin: parsed.linkedin || null,
          website: parsed.website || null,
          signature: parsed.signature || null,
        },
        {
          onConflict: "thread_id",
          ignoreDuplicates: false,
        }
      );

    if (insertError) {
      console.error("Error inserting extracted fields:", insertError);
    }

    // 3. Update lead if enrichment fields exist
    if (lead_id && (parsed.phone || parsed.linkedin || parsed.website)) {
      const updateData: Record<string, string | null> = {};
      if (parsed.phone) updateData.phone = parsed.phone;
      if (parsed.linkedin) updateData.linkedin = parsed.linkedin;
      if (parsed.website) updateData.website = parsed.website;

      const { error: updateError } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead_id);

      if (updateError) {
        console.error("Error updating lead:", updateError);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, extracted: parsed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-smart-actions:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});










