import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/replyDetection`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-key": process.env.REPLIES_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
