import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-train-start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: body || JSON.stringify({}),
  });
  return NextResponse.json(await r.json());
}



















