import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";
import crypto from "node:crypto";

const Body = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
  expires_in_hours: z.number().min(1).max(240).default(72),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role, expires_in_hours } = parsed.data;

  const { data: u } = await supabase
    .from("auth.users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (u?.id) {
    const { error } = await supabase
      .from("campaign_members")
      .insert({ campaign_id: params.id, user_id: u.id, role })
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "added" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expires_at = new Date(Date.now() + expires_in_hours * 3600_000).toISOString();
  const { data: me } = await supabase.auth.getUser();
  const invited_by = me.user?.id as string;

  const { error } = await supabase.from("campaign_invites").upsert(
    {
      campaign_id: params.id,
      email,
      role,
      invited_by,
      token,
      expires_at,
    },
    { onConflict: "campaign_id,email" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${origin}/join/${token}`;
  return NextResponse.json({ ok: true, mode: "invited", link });
}

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor"]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role } = parsed.data;

  const { data: uidRes, error: uidErr } = await supabase.rpc("user_id_by_email", { p_email: email });
  if (uidErr) {
    return NextResponse.json({ error: uidErr.message }, { status: 500 });
  }

  if (uidRes) {
    const { error } = await supabase
      .from("campaign_members")
      .upsert(
        {
          campaign_id: params.id,
          user_id: uidRes as string,
          role,
        },
        { onConflict: "campaign_id,user_id" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, added: true });
  }

  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from("campaign_invites").insert({
    campaign_id: params.id,
    email,
    role,
    invited_by: me?.user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pending: true });
}



