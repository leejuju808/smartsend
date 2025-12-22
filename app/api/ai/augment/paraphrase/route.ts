import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-augment-paraphrase`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body,
    }
  );

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}

















