import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const org = url.searchParams.get("org");
  if (!org) return NextResponse.json({ ok: true });

  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/oauth_connections?org_id=eq.${org}&provider=eq.google`,
    {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  );

  // Optional: clear gmail_state
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gmail_state?org_id=eq.${org}`,
    {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  );

  return NextResponse.json({ ok: true });
}

