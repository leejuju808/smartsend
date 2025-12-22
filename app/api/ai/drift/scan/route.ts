import { NextResponse } from "next/server";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase configuration" }, { status: 500 });
  }

  const res = await fetch(`${url}/functions/v1/ai-drift-scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`
    }
  });

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}
