import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendHtmlEmail } from "@/lib/mailer";
import { renderTemplate } from "@/lib/renderTemplate";
import { sign } from "@/lib/events-sign";

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowISO = new Date().toISOString();

  // 1) Activate campaigns whose scheduled_at is due
  const { data: dueCampaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id,user_id,status")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowISO)
    .limit(25);

  for (const camp of dueCampaigns || []) {
    await supabaseAdmin.from("campaigns").update({ status: "running", started_at: nowISO }).eq("id", camp.id);
  }

  // 2) Process batches for running campaigns
  const { data: running } = await supabaseAdmin
    .from("campaigns")
    .select("id,user_id,status,subject,body_html,from_name,from_email")
    .eq("status", "running")
    .limit(10);

  let processed = 0;

  for (const camp of running || []) {
    const { data: recips } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, contact_id, email_lower, name")
      .eq("campaign_id", camp.id)
      .eq("status", "queued")
      .limit(50);

    if (!recips || recips.length === 0) {
      // complete campaign
      await supabaseAdmin.from("campaigns").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", camp.id);
      
      // Mark onboarding step as complete for the first campaign completion
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", camp.user_id)
          .maybeSingle();
        if (profile?.id) {
          await supabaseAdmin.rpc("merge_onboarding_step", { uid: profile.id, k: "send_campaign" });
        }
      } catch (e) {
        // Don't fail the campaign completion if onboarding update fails
        console.warn('Failed to update onboarding step:', e);
      }
      
      continue;
    }

    // Bulk-load contacts for personalization
    const contactIds = Array.from(new Set((recips || []).map((r: any) => (r as any).contact_id).filter(Boolean)));
    const contactsById: Record<string, any> = {};
    if (contactIds.length) {
      const { data: contacts } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, name, company, email")
        .in("id", contactIds);
      for (const c of contacts || []) contactsById[(c as any).id] = c;
    }

    for (const r of recips) {
      try {
        const contact = contactsById[(r as any).contact_id] || { name: (r as any).name, email: (r as any).email_lower };
        const subject = renderTemplate((camp as any).subject || "", contact);
        const html = trackedHtml(
          renderTemplate((camp as any).body_html || (camp as any).body || "", contact),
          String((camp as any).id),
          String((r as any).id)
        );

        await sendHtmlEmail({
          to: (r as any).email_lower,
          subject,
          html,
          fromName: (camp as any).from_name || undefined,
          fromEmail: (camp as any).from_email || undefined,
        });
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", (r as any).id);
      } catch (e: any) {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "failed", error: String(e?.message || e) })
          .eq("id", (r as any).id);
      }
      processed++;
    }
  }

  return NextResponse.json({ ok: true, processed });
}

function trackedHtml(bodyHtml: string, campId: string, recipId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const re = /href="(https?:\/\/[^\"]+)"/gi;
  const withLinks = bodyHtml.replace(re, (_m, url) => {
    const u = Buffer.from(url, "utf8").toString("base64");
    const sig = sign(`${campId}:${recipId}:${u}`);
    return `href="${base}/t/c?cid=${campId}&rid=${recipId}&u=${encodeURIComponent(u)}&s=${sig}"`;
  });
  const sig = sign(`${campId}:${recipId}:open`);
  const pixel = `<img src="${base}/t/o?cid=${campId}&rid=${recipId}&s=${sig}" width="1" height="1" style="display:none" />`;
  return `${withLinks}\n${pixel}`;
}

