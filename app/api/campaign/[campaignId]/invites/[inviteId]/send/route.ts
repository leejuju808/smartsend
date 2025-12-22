import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Resend } from "resend";

const brandHtml = (url: string, role: string, expiresAt: string) => `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Inter,Arial,sans-serif">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px;padding:24px;border:1px solid #e5e7eb;border-radius:16px">
        <tr><td align="center" style="font-size:18px;font-weight:700">SmartSend ⚡</td></tr>
        <tr><td align="center" style="padding:8px 0 16px;color:#6b7280">You’ve been invited to a campaign</td></tr>
        <tr><td align="center" style="padding:4px 0 16px">Role: <b>${role}</b></td></tr>
        <tr><td align="center" style="padding:16px 0">
          <a href="${url}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;display:inline-block">Accept invite</a>
        </td></tr>
        <tr><td align="center" style="font-size:12px;color:#9ca3af">Expires ${expiresAt}</td></tr>
      </table>
    </td></tr>
  </table>
`;

export async function POST(req: NextRequest, { params }: { params: { campaignId: string; inviteId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mem = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", params.campaignId)
    .eq("user_id", user.id)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (mem.error) {
    return NextResponse.json({ error: mem.error.message }, { status: 500 });
  }

  if (!mem.data) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  const adminUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  const linkResponse = await fetch(`${adminUrl}/api/admin/invite-link?id=${params.inviteId}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  const linkJson = await linkResponse.json();

  if (!linkResponse.ok || !linkJson?.url) {
    return NextResponse.json({ error: linkJson?.error ?? "link_error" }, { status: 500 });
  }

  const inv = await supabase
    .from("campaign_invites")
    .select("email,role,expires_at")
    .eq("id", params.inviteId)
    .single();

  if (inv.error || !inv.data) {
    return NextResponse.json({ error: inv.error?.message ?? "invite_not_found" }, { status: 404 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const expiresAt = inv.data.expires_at ? new Date(inv.data.expires_at).toLocaleString() : "soon";
  const html = brandHtml(linkJson.url, inv.data.role, expiresAt);
  const { error } = await resend.emails.send({
    from: process.env.INVITES_FROM_EMAIL ?? "SmartSend <noreply@yourdomain.com>",
    to: inv.data.email,
    subject: "You’re invited to a SmartSend campaign",
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

