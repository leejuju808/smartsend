import { NextResponse } from "next/server";

const FUNCTION_URL = process.env.SB_REPLY_FN_URL!; // e.g., https://xxxx.functions.supabase.co/replyDetection
const WEBHOOK_SECRET = process.env.REPLY_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  try {
    // Normalize your provider payload here if needed:
    const provider = req.headers.get("x-provider") || "unknown";
    const raw = await req.json();

    // Example normalizer (adjust to your provider):
    const normalized = {
      provider,
      from_email: raw.from || raw.from_email || "",
      to_email: raw.to || raw.to_email || "",
      subject: raw.subject || "",
      body: raw.text || raw.body || raw.html || "",
      thread_id: raw.threadId || raw.thread_id || null,
    };

    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reply-secret": WEBHOOK_SECRET
      },
      body: JSON.stringify(normalized),
      cache: "no-store",
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Webhook proxy failed" }, { status: 500 });
  }
}
