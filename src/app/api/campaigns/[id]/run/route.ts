export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { sendHtmlEmail } from "@/lib/mailer";
import { renderTemplate } from "@/lib/personalize";
import { enforceQuotaAndLog } from "@/lib/usage";
import crypto from "crypto";
import { sign } from "@/lib/events-sign";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const batchSize = Number(process.env.BROADCAST_BATCH_SIZE || 100);

  const { data: camp } = await supabase.from("campaigns").select("*").eq("id", params.id).single();
  if (!camp || camp.status !== "running") return NextResponse.json({ error: "Not running" }, { status: 400 });

  // fetch next batch
  const { data: recips } = await supabase
    .from("campaign_recipients")
    .select("id, email_lower, name, contact_id")
    .eq("campaign_id", camp.id)
    .eq("status", "queued")
    .limit(batchSize);

  if (!recips || recips.length === 0) {
    await supabase.from("campaigns").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", camp.id);
    return NextResponse.json({ done: true });
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const r of recips) {
    // Quota guard
    const quota = await enforceQuotaAndLog({ source: "broadcast", campaign: camp.id });
    if (!quota.ok) {
      // Pause campaign if quota hit
      await supabase.from("campaigns").update({ status: "paused" }).eq("id", camp.id);
      break;
    }

    // Ensure unsubscribe token exists
    let token = crypto.randomUUID();
    await supabase.from("unsub_tokens").upsert({ token, user_id: user.id, contact_id: (r as any).contact_id });

    const html = trackedHtml(
      renderTemplate(camp.body_html, { name: (r as any).name, email: (r as any).email_lower }),
      String(camp.id),
      String((r as any).id)
    );

    try {
      await sendHtmlEmail({
        to: (r as any).email_lower,
        subject: camp.subject,
        html,
        fromName: camp.from_name || undefined,
        fromEmail: camp.from_email || undefined,
      });
      await supabase.from("campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", (r as any).id);
      sent++;
    } catch (e: any) {
      await supabase.from("campaign_recipients").update({ status: "failed", error: String(e?.message || e) }).eq("id", (r as any).id);
      failed++;
    }
  }

  // Update counters
  const { data: counts } = await supabase
    .from("campaign_recipients")
    .select("status", { count: "exact" })
    .eq("campaign_id", camp.id);

  const totalSent = (counts || []).filter((x: any) => x.status === "sent").length;
  const totalFailed = (counts || []).filter((x: any) => x.status === "failed").length;
  const totalSkipped = (counts || []).filter((x: any) => x.status === "skipped").length;

  await supabase.from("campaigns")
    .update({ sent: totalSent, failed: totalFailed, skipped: totalSkipped })
    .eq("id", camp.id);

  return NextResponse.json({ ok: true, batch: (recips || []).length, sent, failed, skipped });
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

