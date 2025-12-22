import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  scope: z.enum(["account", "campaign"]),
  campaignId: z.string().uuid().optional(),
  role: z.enum(["owner", "admin", "editor", "viewer"]).default("viewer"),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const payload = schema.parse(body);

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  const accountId = profile?.account_id;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "No account" }, { status: 400 });
  }

  if (payload.scope === "account") {
    const { data: member } = await supabase
      .from("team_members")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  } else {
    const { data: campaignMember } = await supabase
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", payload.campaignId!)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!campaignMember && payload.campaignId) {
      const { data: member } = await supabase
        .from("team_members")
        .select("role")
        .eq("account_id", accountId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!member || !["owner", "admin"].includes(member.role)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    } else if (campaignMember && !["owner", "admin"].includes(campaignMember.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("invites").insert({
    inviter_id: user.id,
    account_id: accountId,
    email: payload.email,
    scope: payload.scope,
    campaign_id: payload.scope === "campaign" ? payload.campaignId! : null,
    role: payload.role,
    token,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, token });
}




