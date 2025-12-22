import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subject, text, html, tone = "concise", length = "short", goal = "book a short call", keepPlaceholders = true } = body;

    const sys = [
      "You are rewriting cold email templates for a sales outreach app.",
      "Keep meaning but improve clarity, persuasion, and brevity.",
      keepPlaceholders ? "Do NOT remove or alter placeholder tokens like {{first_name}} or {{company}}. Leave them intact and in English." : "",
      "Respect the requested tone and length. Keep subject lines punchy (≤ 8 words if possible).",
      "Return JSON with keys: subject (string), text (string), html (string). If an input is missing, generate it.",
    ].filter(Boolean).join(" ");

    const msg = {
      role: "user",
      content: JSON.stringify({
        tone, length, goal,
        subject, text, html
      }),
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          msg,
        ],
      }),
    });

    if (!r.ok) {
      return new NextResponse(await r.text(), { status: r.status });
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let out: any = {};
    try { out = JSON.parse(raw); } catch { out = {}; }

    // Safeguard: ensure placeholders survive (best-effort)
    const ensureTokens = (s?: string, fallback?: string) => (typeof s === "string" && s.length ? s : (fallback ?? ""));

    return NextResponse.json({
      subject: ensureTokens(out.subject, subject),
      text: ensureTokens(out.text, text),
      html: ensureTokens(out.html, html),
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Internal Error", { status: 500 });
  }
}
