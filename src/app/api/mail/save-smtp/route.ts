import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) {
  return new URL(req.url).searchParams.get("userId");
}

export async function POST(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const required = ["from_email", "smtp_host", "smtp_port", "smtp_user", "smtp_pass"];
  for (const k of required)
    if (!(b as any)[k]) return NextResponse.json({ error: `Missing ${k}` }, { status: 400 });

  const row = {
    owner: userId,
    provider: "smtp",
    from_email: (b as any).from_email,
    from_name: (b as any).from_name || null,
    smtp_host: (b as any).smtp_host,
    smtp_port: Number((b as any).smtp_port),
    smtp_secure: !!(b as any).smtp_secure,
    smtp_user: (b as any).smtp_user,
    smtp_pass: (b as any).smtp_pass, // Prefer app password
    verified: false,
    updated_at: new Date().toISOString(),
  } as const;
  const { error } = await supabaseAdmin.from("mailboxes").upsert(row, { onConflict: "owner" });
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

