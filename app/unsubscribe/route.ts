import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/server/supabase";
import { verifyUnsubToken } from "@/lib/unsubToken";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function html(msg: string) {
  return `
  <!doctype html><meta name="viewport" content="width=device-width">
  <body style="background:#0b0b0b;color:#eee;font-family:system-ui;display:grid;place-items:center;min-height:100vh;">
    <div style="max-width:560px;padding:24px;border:1px solid #222;border-radius:14px;background:#111">
      <h1 style="margin:0 0 8px 0;">SmartSend ⚡</h1>
      <p>${msg}</p>
      <a href="/" style="display:inline-block;margin-top:12px;padding:10px 14px;background:#f5c518;color:#000;border-radius:10px;text-decoration:none;">Go home</a>
    </div>
  </body>`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const h = headers();
  const ua = h.get("user-agent") || "";
  const ip = h.get("x-forwarded-for") || "";

  const data = token ? verifyUnsubToken(token) : null;
  if (!data) return new NextResponse(html("Invalid or expired link."), { headers: { "Content-Type": "text/html" }, status: 400 });

  const { user_id, email } = data;
  await supabaseAdmin.from("suppression_list").upsert({ user_id, email });
  await supabaseAdmin.from("unsubscribe_events").insert({ user_id, email, source: "web_form", user_agent: ua, ip });

  return new NextResponse(html(`You've been unsubscribed for <b>${email}</b>.`), { headers: { "Content-Type": "text/html" } });
}

export async function POST(req: Request) {
  try {
    const { campaign_id, email, token } = await req.json();
    if (!campaign_id || !email || !token) {
      return new Response("Bad Request", { status: 400 });
    }

    const payload = `unsub:${campaign_id}:${email.toLowerCase()}`;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: ok } = await admin.rpc("_verify", { p: payload, tok: token });
    if (!ok) return new Response("Invalid token", { status: 400 });

    // Get IP and user agent for tracking
    const h = headers();
    const ua = h.get("user-agent") || "";
    const forwardedFor = h.get("x-forwarded-for") || "";
    const ipStr = forwardedFor.split(",")[0]?.trim();
    // p_ip expects inet type; pass null if invalid
    const ip = ipStr && /^\d+\.\d+\.\d+\.\d+$/.test(ipStr) ? ipStr : null;

    // Record tracking event
    await admin.rpc("_record_tracking", {
      p_kind: "unsubscribe",
      p_campaign: campaign_id,
      p_send_log: null,
      p_lead: null,
      p_url: null,
      p_ua: ua,
      p_ip: ip,
      p_meta: {}
    }).catch(() => {});

    // Suppress at both levels
    await admin.rpc("add_unsubscribe", { p_campaign: campaign_id, p_email: email }).catch(() => {});

    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response("Internal Server Error", { status: 500 });
  }
}