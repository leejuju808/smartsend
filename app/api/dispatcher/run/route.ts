import { NextResponse } from "next/server";

export async function POST() {
  const base = process.env.SUPABASE_FUNCTION_URL_BASE || process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const url = `${base}/send-dispatcher`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-Dispatcher-Secret": process.env.DISPATCHER_SECRET || "",
    },
  });
  const json = await resp.json().catch(() => ({ ok: false }));
  return NextResponse.json(json, { status: resp.status });
}


