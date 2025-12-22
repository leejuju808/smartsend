// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  try {
    const { sequence, goal, tone } = await req.json();

    if (!sequence || !Array.isArray(sequence) || sequence.length === 0) {
      return new Response(
        JSON.stringify({ error: "sequence is required and must be a non-empty array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const prompt = `
You are an expert cold email copywriter. Optimize this entire multi-step sequence.

### GOAL
${goal || "Maximize reply rate and engagement"}

### TONE
${tone || "professional"}

### SEQUENCE (with variables)
${JSON.stringify(sequence, null, 2)}

RULES:
- KEEP ALL template variables EXACTLY (e.g., {{first_name}}, {{company}}, {{custom1}})
- Preserve each step's meaning but improve clarity, punch, flow, and reply rate
- Shorten long steps by ~20–35% if they're bloated
- Make subject lines concise and curiosity-driven (40-60 characters ideal)
- Improve CTA for higher response (clear, low-pressure, specific)
- Suggest ideal delay between steps (typically 2-4 days)
- If a step is redundant, merge or rewrite it
- If a step is weak, rewrite strongly
- Maintain step count unless changes are clearly needed
- Add optional Step 0 (soft opener) only if it adds value
- Format body as HTML with proper paragraph tags (<p>...</p>)
- Preserve line breaks and structure
- Return clean, valid JSON only

OUTPUT FORMAT (JSON):
{
  "steps": [
    {
      "subject": "Subject line here",
      "body": "<p>HTML formatted body here</p>",
      "delay_days": 2
    },
    ...
  ],
  "notes": ["Note 1", "Note 2"]
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = completion.choices[0].message.content;
    
    if (!result) {
      throw new Error("No response from OpenAI");
    }

    // Parse and validate the JSON response
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (e) {
      throw new Error(`Invalid JSON response from AI: ${e}`);
    }

    // Ensure the response has the expected structure
    if (!parsed.steps || !Array.isArray(parsed.steps)) {
      throw new Error("AI response missing 'steps' array");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("AI Sequence Optimizer error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to optimize sequence" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

