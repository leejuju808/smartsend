import { NextResponse } from "next/server";

export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CRON_SECRET;

  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "missing_config" }, { status: 500 });
  }

  const url = new URL(`${baseUrl}/functions/v1/followup-nudge`);
  url.searchParams.set("key", secret);

  const resp = await fetch(url.toString());
  const payload = await resp.json().catch(() => ({}));

  return NextResponse.json(payload, { status: resp.status });
}
import { NextResponse } from "next/server";

export async function POST() {
  const endpoint =
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_FOLLOWUP ?? "/functions/v1/followup-nudger";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY ?? ""}`,
    },
  }).catch(() => null);

  if (!res) {
    return NextResponse.json({ error: "invoke failed" }, { status: 500 });
  }

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json);
}


