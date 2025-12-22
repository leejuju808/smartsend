import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = process.env.REPLY_WEBHOOK_SECRET!;

  const res = await fetch(`${supabaseUrl}/functions/v1/reply-detection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Must match the header expected by the edge function
      "x-webhook-secret": secret,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}


