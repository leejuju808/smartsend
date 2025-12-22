import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const org = url.searchParams.get("org");
  if (!org) return NextResponse.json({ connected: false }, { status: 200 });

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/oauth_connections?org_id=eq.${org}&provider=eq.google&select=*`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) return NextResponse.json({ connected: false }, { status: 200 });
  const rows = await res.json();
  if (!rows || rows.length === 0)
    return NextResponse.json({ connected: false }, { status: 200 });
  const row = rows[0];
  return NextResponse.json(
    {
      connected: true,
      email: row.provider_email,
      expires_at: row.expires_at,
    },
    { status: 200 }
  );
}

