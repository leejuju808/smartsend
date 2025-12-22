import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.REPLY_WEBHOOK_SECRET!;
  const supaFnUrl = `${process.env.SUPABASE_FUNCTION_URL_BASE}/reply-detection`;

  const body = await req.text();
  const resp = await fetch(supaFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      "X-Webhook-Secret": secret,
    },
    body
  });

  const text = await resp.text();
  return new NextResponse(text, { status: resp.status, headers: { "Content-Type": resp.headers.get("content-type") || "application/json" }});
}

















