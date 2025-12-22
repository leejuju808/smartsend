import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { notifyInviteAccepted } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Try pending_invites system first (using accept_invite function)
  try {
    const { data: acceptResult, error: acceptErr } = await supabase
      .rpc('accept_invite', { p_token: token });

    if (!acceptErr && acceptResult === 'accepted') {
      // Get the invite to find campaign and owner info for notification
      const { data: invite } = await supabase
        .from("pending_invites")
        .select("campaign_id, email, role")
        .eq("token", token)
        .maybeSingle();

      if (invite) {
        // Get campaign and owner info for notification
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, name, user_id")
          .eq("id", invite.campaign_id)
          .single();

        if (campaign) {
          // Get owner email
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", campaign.user_id)
            .maybeSingle();

          // Fire-and-forget notification to owner
          if (ownerProfile?.email) {
            notifyInviteAccepted({
              ownerEmail: ownerProfile.email,
              inviteeEmail: user.email || invite.email,
              campaignName: campaign.name || "Campaign",
            }).catch(err => console.error("Failed to send accept notification:", err));
          }
        }
      }

      return NextResponse.json({ ok: true, campaignId: invite?.campaign_id });
    }
  } catch (err) {
    // Continue to fallback systems
  }

  // Try new invite_tokens system
  const { data: inviteTokens, error: tokenErr } = await supabase
    .rpc('consume_invite', { p_token: token, p_user: user.id });

  if (!tokenErr && inviteTokens && inviteTokens.length > 0) {
    const inviteToken = inviteTokens[0]
    return NextResponse.json({ ok: true, campaignId: inviteToken.campaign_id });
  }

  // Fallback to legacy campaign_invites table
  const { data: invite, error } = await supabase
    .from("campaign_invites")
    .select("id,campaign_id,email,role,accepted_by,accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  if (invite.accepted_by) return NextResponse.json({ error: "Invite already accepted" }, { status: 400 });

  // For email-based invites, check email match (link-based don't need this)
  const email = (user.email || "").toLowerCase();
  if (invite.email && email !== String(invite.email).toLowerCase()) {
    return NextResponse.json({ error: "Invite email mismatch" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("campaign_shares")
    .upsert({
      campaign_id: invite.campaign_id,
      user_id: user.id,
      role: invite.role,
    }, { onConflict: "campaign_id,user_id" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await supabase
    .from("campaign_invites")
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, campaignId: invite.campaign_id });
}


