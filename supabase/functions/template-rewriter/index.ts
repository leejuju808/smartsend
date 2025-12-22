// Block 303 — Smart Template Rewriter v1
// Edge function to rewrite email templates using OpenAI while preserving merge fields

import OpenAI from "npm:openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

Deno.serve(async (req) => {
  try {
    const { subject, body, tone, length, variants, merge_fields } =
      await req.json();

    const safeTone =
      tone && ["casual", "neutral", "formal", "playful"].includes(tone)
        ? tone
        : "neutral";

    const safeLength =
      length && ["short", "medium", "long"].includes(length)
        ? length
        : "medium";

    const count =
      typeof variants === "number" && variants > 0 && variants <= 10
        ? variants
        : 3;

    const mergeFieldList =
      Array.isArray(merge_fields) && merge_fields.length > 0
        ? merge_fields.join(", ")
        : "";

    const prompt = `
You are SmartSend's Smart Template Rewriter.

Your job:
- Rewrite cold email templates.
- Maintain all merge fields EXACTLY as given, including curly braces.
- Merge fields you MUST preserve: ${mergeFieldList || "none explicitly listed"}.
- Keep emails cold-outreach-appropriate and spam-safe.

Return STRICT JSON:
{
  "subject_variants": ["...", "..."],
  "body_variants": ["...", "..."]
}

Constraints:
- Tone: ${safeTone}
- Length: ${safeLength}
- Number of variants: ${count}
- Avoid spammy phrases: "act now", "limited time", "guaranteed", excessive exclamation marks.
- You may lightly improve clarity and flow, but keep the core value proposition the same.
- Never remove or reformat merge fields like {first_name} or {{company}}.

Original subject:
${subject || ""}

Original body:
${body || ""}

Generate exactly ${count} alternative subject lines and ${count} alternative bodies.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional email template rewriter. Always return valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: wrap the raw text as a single variant
      parsed = {
        subject_variants: [subject || ""],
        body_variants: [body || raw],
      };
    }

    // Ensure arrays exist and have correct length
    if (!Array.isArray(parsed.subject_variants)) {
      parsed.subject_variants = [subject || ""];
    }
    if (!Array.isArray(parsed.body_variants)) {
      parsed.body_variants = [body || raw];
    }

    // Ensure we have the right number of variants
    while (parsed.subject_variants.length < count) {
      parsed.subject_variants.push(subject || "");
    }
    while (parsed.body_variants.length < count) {
      parsed.body_variants.push(body || "");
    }

    // Trim to requested count
    parsed.subject_variants = parsed.subject_variants.slice(0, count);
    parsed.body_variants = parsed.body_variants.slice(0, count);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in template-rewriter:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
