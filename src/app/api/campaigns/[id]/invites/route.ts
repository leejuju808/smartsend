import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data, error } = await admin
    .from("campaign_invites")
    .select("id, created_at, updated_at, email, role, status, token, invited_by, expires_at, accepted_at")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return new Response(error.message, { status: 400 });
  return new Response(JSON.stringify({ items: data || [] }), { headers: { "content-type":"application/json" }});
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { email, role } = await req.json();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.rpc("create_campaign_invite", {
    p_campaign: params.id,
    p_email: email,
    p_role: role || "viewer",
  });
  if (error) return new Response(error.message, { status: 400 });
  const token = data as string | null;

  const payload = { ok: true, pending: Boolean(token), token };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const apiKey = process.env.RESEND_API_KEY ?? "";

  if (payload.pending && base && apiKey) {
    const { data: invite } = await admin
      .from("campaign_invites")
      .select("token,email")
      .eq("campaign_id", params.id)
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inviteToken = invite?.token ?? token;

    if (inviteToken) {
      const link = `${base}/invite/${encodeURIComponent(inviteToken)}`;
      void fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: "SmartSend <noreply@smartsendhq.com>",
          to: [email],
          subject: "You’ve been invited to a SmartSend campaign",
          html: `<p>You were invited to join a SmartSend campaign.</p>
               <p><a href="${link}">Accept invite</a></p>
               <p>If the button doesn’t work, paste this link in your browser:<br>${link}</p>`,
        }),
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify(payload), { headers: { "content-type":"application/json" }});
}
