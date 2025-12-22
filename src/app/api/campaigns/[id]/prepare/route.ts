import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id;
  const body = await req.json().catch(() => ({}));
  const source = body?.source || "all_contacts";
  let emails: string[] = [];

  if (source === "emails") {
    emails = (body?.emails || []).map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  } else {
    // all contacts
    const { data: contacts, error } = await supabase.from("contacts").select("email").eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    emails = (contacts || []).map((c: any) => (c.email as string).toLowerCase());
  }

  // Mark suppressed upfront
  const { data: sup, error: sErr } = await supabase
    .from("suppression_emails")
    .select("email")
    .in("email", emails);

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  const suppressed = new Set((sup || []).map((r: any) => (r.email as string).toLowerCase()));

  const rows = emails.map((email) => ({
    campaign_id: id,
    user_id: user.id,
    email,
    status: suppressed.has(email) ? "suppressed" : "pending",
  }));

  const { error: insErr } = await supabase.from("campaign_recipients_new")
    .upsert(rows, { onConflict: "campaign_id,email" });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await supabase.from("campaigns_new").update({
    total_recipients: emails.length,
    status: "ready",
  }).eq("id", id).eq("user_id", user.id);

  return NextResponse.json({ ok: true, total: emails.length, suppressed: suppressed.size });
} 