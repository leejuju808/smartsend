import { serve } from "https://deno.land/std/http/server.ts";
import OpenAI from "npm:openai@4";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

serve(async (req) => {
  try {
    const { template } = await req.json();

    if (!template || typeof template !== "string") {
      return new Response(
        JSON.stringify({ error: "Template is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert cold email copywriter. Your task is to rewrite cold email templates into 3 distinct versions, each with a different tone.

Rules:
- Keep each version under 120 words
- Maintain the same call-to-action across all versions
- Preserve variable tokens in double braces like {{first_name}}, {{company}}, {{title}} exactly as they appear
- Make each version distinct in style while keeping the core message
- Return ONLY a JSON object with this structure:
{
  "versions": [
    {"tone": "Professional", "content": "..."},
    {"tone": "Conversational", "content": "..."},
    {"tone": "Punchy", "content": "..."}
  ]
}`;

    const userPrompt = `Rewrite this cold email into 3 distinct versions in different tones (Professional, Conversational, Punchy).

Keep it under 120 words. Maintain the same call-to-action.

Original:

${template}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Validate response structure
    if (!parsed.versions || !Array.isArray(parsed.versions) || parsed.versions.length !== 3) {
      throw new Error("Invalid response format from OpenAI");
    }

    // Ensure all versions have the correct structure
    const versions = parsed.versions.map((v: any) => ({
      tone: v.tone || "Unknown",
      content: v.content || "",
    }));

    return new Response(
      JSON.stringify({ versions }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Error in rewrite-email:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Failed to rewrite email" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

