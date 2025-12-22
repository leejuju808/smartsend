import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();

  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/eval-generate-set`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: body && body.length > 0 ? body : JSON.stringify({ size: 200 }),
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}



















