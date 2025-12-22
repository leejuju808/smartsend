import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

export async function POST(req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ role: z.enum(["owner", "editor", "viewer"]) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { error } = await supabase
    .from("campaign_members")
    .update({ role: parsed.data.role })
    .eq("id", params.memberId)
    .eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("id", params.memberId)
    .eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Patch = z.object({
  role: z.enum(["viewer", "editor", "owner"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const parsed = Patch.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { role } = parsed.data;

  if (!role) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("campaign_members").update({ role }).eq("id", params.memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.from("campaign_members").delete().eq("id", params.memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



