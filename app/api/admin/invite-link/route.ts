import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const inv = await supabase
    .from("campaign_invites")
    .select("id,campaign_id")
    .eq("id", id)
    .single();

  if (inv.error || !inv.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const me = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", inv.data.campaign_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (me.error) {
    return NextResponse.json({ error: me.error.message }, { status: 500 });
  }
  if (!me.data) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const full = await admin
    .from("campaign_invites")
    .select("token,expires_at")
    .eq("id", id)
    .single();

  if (full.error || !full.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const link = `${base}/join?token=${full.data.token}`;

  return NextResponse.json({ url: link, expires_at: full.data.expires_at });
}




