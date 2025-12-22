import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { message_id } = await req.json();
  if (!message_id) {
    return NextResponse.json({ ok: false, error: "missing_message_id" }, { status: 400 });
  }

  const url = process.env.REPLY_CLASSIFY_URL;
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing_reply_classify_url" }, { status: 500 });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id }),
  });

  const payload = await response.json().catch(() => ({ ok: false, error: "invalid_json" }));
  return NextResponse.json(payload, { status: response.status });
}

