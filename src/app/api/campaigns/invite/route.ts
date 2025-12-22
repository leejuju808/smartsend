import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = getServerSupabase();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId, email, role } = await req.json();
  if (!campaignId || !email) {
    return NextResponse.json({ error: "campaignId & email required" }, { status: 400 });
  }

  const normalizedEmail = String(email).toLowerCase();

  // Ensure caller is owner of the campaign
  const { data: me } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me || me.role !== "owner") {
    return NextResponse.json({ error: "Only owner can invite" }, { status: 403 });
  }

  // Insert invite; let DB generate UUID token
  const { data, error } = await supabase
    .from("campaign_invites")
    .insert({
      campaign_id: campaignId,
      email: normalizedEmail,
      role: (role ?? "viewer") as "viewer" | "editor" | "owner",
      created_by: user.id,
    })
    .select("token")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = (data as any)?.token as string | undefined;
  if (!token) {
    return NextResponse.json({ error: "invite_token_missing" }, { status: 500 });
  }
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

  // Log activity
  try {
    await supabase.from("activity_logs").insert({
      campaign_id: campaignId,
      actor_id: user.id,
      event_type: "member_invited",
      meta: { email: normalizedEmail, role: role ?? "viewer" },
    });
  } catch (activityErr) {
    console.error("Failed to log invite activity:", activityErr);
    // Don't fail if activity logging fails
  }

  const { data: camp } = await supabase
    .from("campaigns")
    .select("account_id,from_email,from_name,name")
    .eq("id", campaignId)
    .maybeSingle();

  const fromName = camp?.from_name ?? "SmartSend";
  const fromEmail = camp?.from_email ?? "no-reply@yourdomain.com";
  const accountId = camp?.account_id ?? null;

  const subject = `You’ve been invited to "${camp?.name ?? "a campaign"}"`;
  const body = [
    "Hi,",
    "",
    `You've been invited to collaborate on the campaign "${camp?.name ?? ""}".`,
    `Click to accept: ${inviteUrl}`,
    "",
    `— ${fromName}`,
  ].join("\n");

  if (accountId) {
    const { error: enqueueError } = await supabase.from("send_queue").insert({
      campaign_id: campaignId,
      provider: "gmail",
      account_id: accountId,
      subject,
      body,
      headers: { to: normalizedEmail, from: fromEmail },
      priority: 7,
      queued_at: new Date().toISOString(),
      status: "queued",
      source: "system_invite",
    });

    if (enqueueError) {
      console.error("Failed to enqueue invite email:", enqueueError);
      return NextResponse.json({ error: "failed_to_enqueue_invite_email" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, inviteUrl });
}

