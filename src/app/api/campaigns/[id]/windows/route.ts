import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: role } = await sb.rpc('get_user_campaign_role', { p_campaign: params.id });
  if (!['owner', 'editor'].includes(role)) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const body = await req.json();
  const patch: any = {};
  for (const k of ["use_lead_local_time","fallback_timezone","skip_weekends","skip_holidays","fallback_country"]) {
    if (k in body) patch[k] = body[k];
  }

  const { error } = await sb.from("campaigns").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

