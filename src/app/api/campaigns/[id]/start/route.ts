export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { normalizeEmail, emailDomain } from "@/lib/email";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: camp } = await supabase.from("campaigns").select("*").eq("id", params.id).single();
  if (!camp || camp.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (camp.status !== "draft" && camp.status !== "paused") return NextResponse.json({ error: "Already started" }, { status: 400 });

  // Pull eligible contacts now
  let q = supabase.from("contacts").select("id,email,name,company,unsubscribed").eq("user_id", user.id);
  const seg = camp.segment || {};
  if (!seg.includeUnsubscribed) q = q.eq("unsubscribed", false);
  if (seg.tagsAny?.length) q = q.contains("tags", seg.tagsAny);
  if (seg.search?.trim()) q = q.ilike("email", `%${seg.search.trim()}%`);
  if (seg.includeDomains?.length) q = q.or(seg.includeDomains.map((d: string) => `email.ilike.%@${d}`).join(","));
  // exclude domains handled below

  const { data: contacts } = await q.limit(50000);

  // Load suppression
  const allEmails = new Set((contacts || []).map((c:any) => normalizeEmail(c.email)));
  const domains = new Set(Array.from(allEmails).map(emailDomain).filter(Boolean));
  const { data: sup } = await supabase.from("suppressions").select("kind,value_lower").eq("user_id", user.id).in("value_lower", [...allEmails, ...domains]);
  const supEmails = new Set((sup || []).filter((s:any) => s.kind === "email").map((s:any) => s.value_lower));
  const supDomains = new Set((sup || []).filter((s:any) => s.kind === "domain").map((s:any) => s.value_lower));
  const exclDomains = new Set((seg.excludeDomains || []).map((d: string) => d.toLowerCase()));

  const eligible = (contacts || []).filter((c:any) => {
    const e = normalizeEmail(c.email);
    const d = emailDomain(e);
    if (!e) return false;
    if (exclDomains.has(d)) return false;
    if (supEmails.has(e)) return false;
    if (d && supDomains.has(d)) return false;
    return true;
  });

  // Queue recipients
  const rows = eligible.map((c:any) => ({
    campaign_id: camp.id,
    user_id: user.id,
    contact_id: c.id,
    email_lower: normalizeEmail(c.email),
    name: c.name || null,
    status: "queued",
  }));

  if (rows.length) {
    await supabase.from("campaign_recipients").upsert(rows, { onConflict: "campaign_id,email_lower" });
  }

  await supabase.from("campaigns").update({ status: "running", total: eligible.length, started_at: new Date().toISOString() }).eq("id", camp.id);

  return NextResponse.json({ ok: true, total: eligible.length });
}

