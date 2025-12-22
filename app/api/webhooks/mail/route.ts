import { NextResponse } from "next/server";

const EDGE_URL = process.env.SUPABASE_EDGE_URL;

export async function POST(req: Request) {
  if (!EDGE_URL) {
    return NextResponse.json({ error: "EDGE_URL_NOT_CONFIGURED" }, { status: 500 });
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get("p") ?? "custom";

  const body = await req.text();
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key === "host" || key === "content-length") return;
    headers.set(key, value);
  });
  headers.set("content-type", req.headers.get("content-type") ?? "application/json");

  const res = await fetch(`${EDGE_URL}/mail-webhook?p=${provider}`, {
    method: "POST",
    headers,
    body
  });

  const text = await res.text();
  const forwardHeaders = new Headers({ "content-type": res.headers.get("content-type") ?? "application/json" });

  return new NextResponse(text, { status: res.status, headers: forwardHeaders });
}





