import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/replyDetection`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": process.env.REPLY_WEBHOOK_TOKEN || "",
      },
      body: JSON.stringify(body),
    }
  );

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}