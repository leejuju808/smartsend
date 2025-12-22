import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { assertEditor } from "@/lib/acl";

const Body = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "editor", "viewer"]).default("viewer"),
  expires_days: z.number().min(1).max(60).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const expiresAt = new Date(
    Date.now() + (parsed.data.expires_days ?? 14) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("campaign_invites")
    .insert({
      campaign_id: params.campaignId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept?token=${data.token}`;

  return NextResponse.json({
    ok: true,
    token: data.token,
    url: inviteUrl,
  });
}

