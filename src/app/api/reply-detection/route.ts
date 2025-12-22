import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json(); // { leadId, emailSnippet }

  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-detection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use a service role or a server-side key in a secret-only environment var
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_FOR_FUNCS}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await r.json();
  return NextResponse.json(json, { status: r.status });
}
