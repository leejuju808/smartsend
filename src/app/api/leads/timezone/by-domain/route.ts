import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { domain, timezone } = await req.json();
  if (!domain || !timezone) return NextResponse.json({ error: "domain and timezone required" }, { status: 400 });

  // store mapping for future auto-picks
  await sb.from("domain_timezones").upsert({ domain, timezone });

  // update existing leads for this owner
  const { error } = await sb.from("leads")
    .update({ timezone })
    .eq("user_id", user.id)
    .eq("domain", domain);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, domain, timezone });
}



