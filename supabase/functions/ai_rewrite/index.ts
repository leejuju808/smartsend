import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { text, tone } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const prompt = `Rewrite the following email text in a ${tone || "professional"} tone. Keep it concise, friendly, and preserve all HTML formatting, links (including href attributes), and markup structure. Return only the rewritten HTML/text without any explanation or preface. Preserve paragraph breaks, links, and basic formatting like bold/italic if present.

Text:
${text}`;

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!completion.ok) {
      const error = await completion.text();
      return new Response(JSON.stringify({ error: "OpenAI API error", details: error }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await completion.json();
    const rewritten = data.choices?.[0]?.message?.content || text;

    return new Response(JSON.stringify({ rewritten }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    console.error("Error in ai_rewrite:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

