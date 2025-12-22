import { NextResponse } from "next/server";

export async function POST() {
  const key = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!key || !supabaseUrl) {
    return NextResponse.json(
      { error: "Sync endpoint not configured" },
      { status: 500 }
    );
  }

  const resp = await fetch(
    `${supabaseUrl}/functions/v1/gmail-sync?key=${encodeURIComponent(key)}`
  );
  const body = await resp.json().catch(() => ({}));

  return NextResponse.json(body, { status: resp.status });
}



