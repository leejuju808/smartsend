import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  try {
    const { text, tone, length, goal } = await req.json();

    const prompt = `
Rewrite the following cold email template to match:

- Tone: ${tone || "professional"}

- Length: ${length || "medium"}

- Goal: ${goal || "book a meeting"}

Preserve all {{variables}} exactly as they are.

Template:

"""${text}"""
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    const data = await resp.json();
    const output = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ ok: true, result: output }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

