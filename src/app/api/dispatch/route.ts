import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST() {
  try {
    const functionsBase = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
    if (!functionsBase) {
      return NextResponse.json({ error: "functions_url_missing" }, { status: 500 });
    }

    const secret = process.env.DISPATCH_SECRET || "";
    const res = await fetch(`${functionsBase}/queue-dispatcher`, {
      method: "POST",
      headers: { "x-dispatch-secret": secret },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy_error" }, { status: 500 });
  }
}


