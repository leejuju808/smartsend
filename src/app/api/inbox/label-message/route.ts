import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { message_id: messageId } = await req.json().catch(() => ({}));

  if (!messageId) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Supabase URL not configured" }, { status: 500 });
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/ai_label_message`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-smartsend-sig": process.env.EDGE_SHARED_SECRET ?? "",
    },
    body: JSON.stringify({ message_id: messageId }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json({ error: payload?.error ?? res.statusText }, { status: 500 });
  }

  return NextResponse.json(payload);
}




