import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    return NextResponse.json({ error: "Supabase URL not configured" }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/route-inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => ({ error: "invalid_response" }));
  const status = response.ok ? 200 : response.status || 400;

  return NextResponse.json(payload, { status });
}


