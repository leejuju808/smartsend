export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { workspaceId, name, subject, body: htmlBody, contactIds, scheduledAt } = body || {};
  if (!name || !subject || !htmlBody) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // If workspaces are enabled, verify membership
  if (workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId || null,
      name,
      subject,
      body_html: htmlBody,
      status: scheduledAt ? "scheduled" : "draft",
      scheduled_at: scheduledAt || null,
    })
    .select()
    .single();
  if (error || !campaign) return NextResponse.json({ error: "Could not create" }, { status: 500 });

  // Optional: assign recipients immediately if provided
  if (Array.isArray(contactIds) && contactIds.length) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,email,name")
      .in("id", contactIds);

    const rows = (contacts || [])
      .map((c: any) => ({
        campaign_id: campaign.id,
        user_id: user.id,
        contact_id: c.id,
        email_lower: normalizeEmail(c.email),
        name: c.name || null,
        status: scheduledAt ? "queued" : "queued",
      }))
      .filter((r: any) => !!r.email_lower);

    if (rows.length) {
      await supabase.from("campaign_recipients").upsert(rows, { onConflict: "campaign_id,email_lower" });
      await supabase.from("campaigns").update({ total: rows.length }).eq("id", campaign.id);
    }
  }

  return NextResponse.json({ ok: true, campaign });
}

