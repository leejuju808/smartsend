// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeTrackingToken, injectPixelAndRewrite } from "../_lib/tracking.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("SUPABASE_URL")!.replace(/\/\/[^/]+/, "//functions/v1");
const TRACKING_SECRET = Deno.env.get("TRACKING_SECRET")!;

async function ensureAccessToken(account_id: string) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`, {
    method:"POST",
    headers:{ "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ account_id })
  }).then(r=>r.json());
  if (!r.ok) throw new Error(r.error || "token error");
  return r.access_token as string;
}

function htmlToPlain(html: string) {
  return (html || "").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}

Deno.serve(async (req) => {
  try {
    const { thread_id, template_id, custom_html } = await req.json();
    if (!thread_id || !(template_id || custom_html)) return new Response("missing params",{status:400});

    const { data: t } = await sb.from("inbox_threads").select("id,campaign_id,account_id,lead_id,provider,provider_thread_id,subject").eq("id", thread_id).maybeSingle();
    if (!t) return new Response("thread not found",{status:404});

    const { data: acc } = await sb.from("connected_accounts").select("*").eq("id", t.account_id).maybeSingle();
    const { data: lead } = await sb.from("leads").select("email").eq("id", t.lead_id).maybeSingle();
    if (!acc || !lead?.email) return new Response("account/lead missing",{status:400});

    let html: string = custom_html || "";
    if (template_id) {
      const { data: tpl } = await sb.from("reply_templates").select("body_html").eq("id", template_id).maybeSingle();
      if (!tpl?.body_html) return new Response("template missing",{status:404});
      html = tpl.body_html;
    }

    // Render merge vars if campaign_id and lead_id are available
    if (t.campaign_id && t.lead_id && html) {
      try {
        const renderRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/render-merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            campaign_id: t.campaign_id,
            lead_id: t.lead_id,
            subject_template: "",
            html_template: html
          })
        });
        const renderData = await renderRes.json();
        if (renderData.ok) {
          html = renderData.html;
        }
      } catch (renderErr) {
        // Continue with original html if render fails
        console.error("render-merge failed:", renderErr);
      }
    }

    const access = await ensureAccessToken(acc.id);

    // Get sender email from account (could be 'email' or 'account_email')
    const senderEmail = acc.email || acc.account_email || "";

    // 1) create send_log row early to own the tracking_token
    const { data: log } = await sb.from("send_logs").insert({
      campaign_id: t.campaign_id,
      account_id: acc.id,
      lead_id: t.lead_id,
      thread_id: t.id,
      status: 'sent',
      to_email: lead.email,
      subject: `Re: ${t.subject || ""}`,
      provider: t.provider || "unknown"
    }).select("id").single();

    const trackingToken = crypto.randomUUID();
    const token = await makeTrackingToken({
      tracking_token: trackingToken,
      campaign_id: t.campaign_id,
      account_id: acc.id,
      send_log_id: log.id,
      lead_id: t.lead_id
    }, TRACKING_SECRET);

    // 2) enrich HTML with tracking pixel and link rewriting
    const trackedHtml = injectPixelAndRewrite(html, token, APP_URL);

    // 3) send trackedHtml via provider
    if (t.provider === "gmail") {
      const to = lead.email;
      const body = [
        `Content-Type: text/html; charset="UTF-8"`,
        `MIME-Version: 1.0`,
        `To: ${to}`,
        `Subject: Re: ${t.subject || ""}`,
        `In-Reply-To: ${t.provider_thread_id}`,
        ``,
        trackedHtml
      ].join("\r\n");
      const raw = btoa(unescape(encodeURIComponent(body))).replace(/\+/g,'-').replace(/\//g,'_');
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,{
        method:"POST",
        headers:{ Authorization:`Bearer ${access}`, "content-type":"application/json" },
        body: JSON.stringify({ raw, threadId: t.provider_thread_id })
      });
      if (!res.ok) throw new Error(`gmail ${res.status}`);
    } else if (t.provider === "outlook") {
      const message = {
        subject: `Re: ${t.subject || ""}`,
        body: { contentType: "HTML", content: trackedHtml },
        toRecipients: [{ emailAddress: { address: lead.email } }]
      };
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/sendMail`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${access}`, "content-type":"application/json" },
        body: JSON.stringify({ message, saveToSentItems: true })
      });
      if (!res.ok) throw new Error(`outlook ${res.status}`);
    } else {
      throw new Error("unsupported provider");
    }

    // 4) persist token & trackedHtml on log
    await sb.from("send_logs").update({
      tracking_token: trackingToken,
      body_html: trackedHtml
    }).eq("id", log.id);

    // append outbound to inbox_messages for continuity
    const { data: thr } = await sb.from("inbox_threads").select("id").eq("id", t.id).maybeSingle();
    if (thr?.id) {
      await sb.from("inbox_messages").insert({
        thread_id: thr.id,
        direction:'outbound',
        from_email: senderEmail,
        to_email: lead.email,
        subject: `Re: ${t.subject || ""}`,
        body_html: trackedHtml
      });
    }

    return new Response(JSON.stringify({ ok:true }), { headers:{ "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});

