import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

// tiny helpers (same as worker)
function b64url(str: string){ const b = Buffer.from(str, "utf8").toString("base64"); return b.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function buildRFC822(from: string, to: string, subject: string, text?: string, html?: string){
  const boundary = "----smartsendboundary";
  const headers = [
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0",
    html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : `Content-Type: text/plain; charset="UTF-8"`,
  ].join("\r\n");
  if (!html) return `${headers}\r\n\r\n${text ?? ""}`;
  const parts = [
    `--${boundary}`, `Content-Type: text/plain; charset="UTF-8"`, "", text ?? "",
    `--${boundary}`, `Content-Type: text/html; charset="UTF-8"`, "", html, `--${boundary}--`,
  ].join("\r\n");
  return `${headers}\r\n\r\n${parts}`;
}
function render(tpl: string, ctx: Record<string,string>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}\}/g, (_m, key, fb) => {
    const v = (ctx[key] ?? "").toString().trim();
    return v || (fb ? String(fb) : "");
  });
}
function stripHtml(html: string){
  return html.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { campaignId, providerAccountId, toEmail, leadId } = await req.json();
    if (!campaignId || !providerAccountId || !toEmail) return new NextResponse("Missing fields", { status: 400 });

    const ws = await getActiveWorkspaceId();
    const supabase = getServerSupabase();

    // Load provider account
    const { data: acc, error: accErr } = await supabase
      .from("provider_accounts")
      .select("id, provider, access_token, email_address")
      .eq("id", providerAccountId).eq("workspace_id", ws).maybeSingle();
    if (accErr) throw accErr;
    if (!acc) return new NextResponse("Account not found", { status: 404 });

    // Load campaign templates
    const { data: camp, error: campErr } = await supabase
      .from("campaigns")
      .select("id, subject_tpl, text_tpl, html_tpl")
      .eq("id", campaignId).eq("workspace_id", ws).maybeSingle();
    if (campErr) throw campErr;
    if (!camp) return new NextResponse("Campaign not found", { status: 404 });

    // Sample lead context (explicit leadId → else any lead in this campaign → else empty)
    let ctx: Record<string,string> = {};
    if (leadId) {
      const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("workspace_id", ws).maybeSingle();
      if (lead) ctx = {
        email: lead.email ?? "", first_name: lead.first_name ?? "", last_name: lead.last_name ?? "",
        name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
        company: lead.company ?? "", title: lead.title ?? "", website: lead.website ?? "",
        custom1: lead.custom1 ?? "", custom2: lead.custom2 ?? "", custom3: lead.custom3 ?? "",
      };
    } else {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("campaign_id", campaignId)
        .limit(1).maybeSingle();
      if (lead) ctx = {
        email: lead.email ?? "", first_name: lead.first_name ?? "", last_name: lead.last_name ?? "",
        name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
        company: lead.company ?? "", title: lead.title ?? "", website: lead.website ?? "",
        custom1: lead.custom1 ?? "", custom2: lead.custom2 ?? "", custom3: lead.custom3 ?? "",
      };
    }

    // Render
    let subject = render(camp.subject_tpl ?? "(no subject)", ctx);
    let html = camp.html_tpl ? render(camp.html_tpl, ctx) : undefined;
    let text = camp.text_tpl ? render(camp.text_tpl, ctx) : undefined;
    if (!text && html) text = stripHtml(html);
    if (!text && !html) text = "Hello!";

    // Send via provider
    if (acc.provider === "gmail") {
      const raw = buildRFC822(acc.email_address, toEmail, subject, text, html);
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${acc.access_token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ raw: b64url(raw) }),
      });
      if (!res.ok) return new NextResponse(await res.text(), { status: 500 });
    } else if (acc.provider === "outlook") {
      const body = {
        message: {
          subject,
          body: { contentType: html ? "HTML" : "Text", content: html ?? text ?? "" },
          toRecipients: [{ emailAddress: { address: toEmail } }],
        },
        saveToSentItems: true,
      };
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { "Authorization": `Bearer ${acc.access_token}`, "Content-Type":"application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return new NextResponse(await res.text(), { status: 500 });
    } else {
      return new NextResponse("Unsupported provider", { status: 400 });
    }

    // Optional: log a test entry
    await supabase.from("campaign_logs").insert({
      workspace_id: ws, campaign_id: campaignId, to_email: toEmail,
      subject, body_text: text ?? null, body_html: html ?? null,
      status: "sent", is_test: true,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Internal Error", { status: 500 });
  }
}
