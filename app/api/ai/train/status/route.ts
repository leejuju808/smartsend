import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-train-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body,
  });
  return NextResponse.json(await r.json());
}



















