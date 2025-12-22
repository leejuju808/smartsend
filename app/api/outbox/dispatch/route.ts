import { NextResponse } from "next/server";

export async function POST() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_MAIL ??
    "/functions/v1/mail-dispatcher";

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` },
  }).catch(() => null);

  if (!res) {
    return NextResponse.json({ error: "invoke failed" }, { status: 500 });
  }

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json);
}




