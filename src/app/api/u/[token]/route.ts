import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: t } = await supa
    .from("unsubscribe_tokens")
    .select("workspace_id, email, contact_id, unsubscribed_at")
    .eq("token", params.token)
    .maybeSingle();
  if (!t) return new NextResponse("Invalid or expired link.", { status: 404 });

  if (!t.unsubscribed_at) {
    await supa
      .from("unsubscribe_tokens")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", params.token)
      .eq("workspace_id", t.workspace_id);
  }

  await supa.rpc("suppress_contact", {
    p_workspace_id: t.workspace_id,
    p_email: String(t.email || "").toLowerCase(),
    p_reason: "unsubscribed",
    p_created_by: "system",
    p_created_by_user_id: null,
    p_notes: "One-click opt-out (/api/u/{token})",
  }).catch(() => {});

  await supa.rpc("ss_cancel_outbound_for_email", {
    p_workspace_id: t.workspace_id,
    p_email: String(t.email || "").toLowerCase(),
  }).catch(() => {});

  const html = `
    <html><body style="font-family:Inter,system-ui;padding:32px">
      <h2>You're unsubscribed</h2>
      <p>${String(t.email || "")} won't receive more emails.</p>
    </body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

export async function POST(_: Request, { params }: { params: { token: string } }) {
  // same as GET but JSON
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: t } = await supa
    .from("unsubscribe_tokens")
    .select("workspace_id, email, contact_id, unsubscribed_at")
    .eq("token", params.token)
    .maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: "invalid" }, { status: 404 });

  if (!t.unsubscribed_at) {
    await supa
      .from("unsubscribe_tokens")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", params.token)
      .eq("workspace_id", t.workspace_id);
  }

  await supa.rpc("suppress_contact", {
    p_workspace_id: t.workspace_id,
    p_email: String(t.email || "").toLowerCase(),
    p_reason: "unsubscribed",
    p_created_by: "system",
    p_created_by_user_id: null,
    p_notes: "One-click opt-out (/api/u/{token})",
  }).catch(() => {});

  await supa.rpc("ss_cancel_outbound_for_email", {
    p_workspace_id: t.workspace_id,
    p_email: String(t.email || "").toLowerCase(),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
