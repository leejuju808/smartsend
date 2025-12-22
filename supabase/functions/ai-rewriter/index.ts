import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { text, tone = "concise", length = "short", vars = {} } = await req.json();

    const sys = `You rewrite cold-email text. Keep meaning, improve clarity. 
Return only the rewritten text. No preface.`;

    const user = [
      `Tone: ${tone}`,
      `Length: ${length}`, // "short" | "medium" | "long"
      `Personalization variables (JSON): ${JSON.stringify(vars)}`,
      `Text: """${text}"""`,
      `Rules:`,
      `- Preserve {{tokens}}; do not invent data.`,
      `- If a token exists in vars, replace it. Otherwise, keep token as-is.`,
      `- Avoid spammy phrases; plain language.`,
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });

    if (!r.ok) {
      return new Response(await r.text(), { status: r.status });
    }

    const j = await r.json();
    const out = j.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ text: out }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Error in ai-rewriter:", e);
    return new Response(JSON.stringify({ error: e.toString() }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
