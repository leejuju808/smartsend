import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function demoLeads() {
  return [
    { email: "jordan@acmeco.test", name: "Jordan Lee", company: "Acme Co" },
    { email: "maria@northstar.test", name: "Maria Diaz", company: "Northstar" },
    { email: "kofi@brightlane.test", name: "Kofi Mensah", company: "Brightlane" },
    { email: "amy@atlaslabs.test", name: "Amy Chen", company: "Atlas Labs" },
    { email: "luca@orbit42.test", name: "Luca Rossi", company: "Orbit42" }
  ];
}

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Resolve owner email for leads table (uses owner_email+email unique)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) return NextResponse.json({ error: String(profileErr) }, { status: 500 });
    const ownerEmail = (profile as any)?.email as string | undefined;
    if (!ownerEmail) return NextResponse.json({ error: "Missing owner email" }, { status: 400 });

    // Idempotent: if a demo sequence already exists, skip seeding and just return metrics
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("sequences")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "demo")
      .limit(1);
    if (existingErr) return NextResponse.json({ error: String(existingErr) }, { status: 500 });

    let sequenceId: string | undefined = existing?.[0]?.id as any;

    if (!sequenceId) {
      // 1) Insert leads (ignore duplicates via owner_email,email)
      const leads = demoLeads().map(l => ({ owner_email: ownerEmail, email: l.email.toLowerCase(), name: l.name, company: l.company }));
      await supabaseAdmin.from("leads").upsert(leads, { onConflict: "owner_email,email", ignoreDuplicates: true });

      // 2) Create a demo sequence with JSON steps
      const steps = [
        { step: 1, delayDays: 0, subject: "Quick hello 👋", body: "Hi {{name}},\n\nSaw {{company}} and thought this might help.\n\n%UNSUB%\n123 Demo St, Anywhere, USA" },
        { step: 2, delayDays: 2, subject: "Following up", body: "Circling back, any interest?\n\n%UNSUB%\n123 Demo St, Anywhere, USA" },
        { step: 3, delayDays: 4, subject: "Worth a quick chat?", body: "Happy to share a 5-min overview.\n\n%UNSUB%\n123 Demo St, Anywhere, USA" }
      ];
      const { data: seqIns, error: seqErr } = await supabaseAdmin
        .from("sequences")
        .insert({ user_id: userId, status: "demo", address: ownerEmail, steps })
        .select("id")
        .single();
      if (seqErr) return NextResponse.json({ error: String(seqErr) }, { status: 500 });
      sequenceId = (seqIns as any).id as string;

      // 3) Seed synthetic sends and analytics events for metrics
      const sendRows = demoLeads().map((l, i) => ({
        user_id: userId,
        inbox_id: null,
        to_email: l.email.toLowerCase(),
        subject: steps[0].subject.replace("{{company}}", l.company || ""),
        body: steps[0].body.replace("{{name}}", l.name || "").replace("{{company}}", l.company || ""),
        status: "sent",
        sent_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
      }));
      await supabaseAdmin.from("email_sends").insert(sendRows);

      // 3b) 3 opens, 1 reply
      const openEvents = demoLeads().slice(0, 3).map(l => ({ user_id: userId, name: "email_open", context: { to_email: l.email.toLowerCase() } }));
      const replyEvents = demoLeads().slice(0, 1).map(l => ({ user_id: userId, name: "email_reply", context: { to_email: l.email.toLowerCase() } }));
      await supabaseAdmin.from("analytics_events").insert([...openEvents, ...replyEvents] as any);
    }

    // Compute aggregates for dashboard
    const [{ count: sent }, { count: open }, { count: reply }] = await Promise.all([
      supabaseAdmin.from("email_sends").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabaseAdmin.from("analytics_events").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("name", "email_open"),
      supabaseAdmin.from("analytics_events").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("name", "email_reply"),
    ]);

    return NextResponse.json({ ok: true, sequenceId, metrics: { sent: sent || 5, open: open || 3, reply: reply || 1 } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

