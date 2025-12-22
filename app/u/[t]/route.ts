import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function htmlPage(opts: { email: string; campaignName: string; token: string; error?: string }) {
  const { email, campaignName, token, error } = opts;
  const err = error
    ? `<div style="color:#b91c1c;background:#fee2e2;padding:8px;border-radius:8px;margin-bottom:12px;">${error}</div>`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Unsubscribe — ${campaignName}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter; background:#0b0b0c; color:#e5e7eb; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px;}
  .card{max-width:520px; width:100%; background:#0f1115; border:1px solid #1f2937; border-radius:16px; padding:24px;}
  label{font-size:12px; color:#9ca3af; display:block; margin-bottom:8px;}
  input, textarea, select{width:100%; background:#0b0c10; color:#e5e7eb; border:1px solid #2a2f3a; border-radius:10px; padding:10px;}
  button{width:100%; background:#111827; color:#e5e7eb; border:1px solid #374151; border-radius:12px; padding:10px; cursor:pointer;}
  button:hover{background:#0f1623;}
  .muted{color:#9ca3af; font-size:12px; margin-top:8px;}
</style>
</head>
<body>
  <div class="card">
    ${err}
    <h1 style="font-size:20px; font-weight:600; margin-bottom:8px;">Unsubscribe</h1>
    <p class="muted">You are unsubscribing <strong>${email}</strong> from <strong>${campaignName}</strong>.</p>
    <form method="post" action="/u/${token}">
      <label for="reason">Reason (optional)</label>
      <select name="reason" id="reason">
        <option value="">— Choose a reason —</option>
        <option value="not_interested">Not interested</option>
        <option value="too_many_emails">Too many emails</option>
        <option value="irrelevant">Irrelevant to me</option>
        <option value="other">Other</option>
      </select>
      <label for="details" style="margin-top:12px;">Additional details (optional)</label>
      <textarea id="details" name="details" rows="3" placeholder="Tell us more (optional)"></textarea>
      <div style="height:12px"></div>
      <button type="submit">Confirm Unsubscribe</button>
      <p class="muted">We will stop future emails for this campaign. You can resubscribe by replying to any thread.</p>
      <input type="hidden" name="t" value="${token}" />
    </form>
  </div>
</body></html>`;
}

function htmlDone(email: string, campaignName: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribed</title>
  <style>body{font-family:ui-sans-serif,system-ui; background:#0b0b0c; color:#e5e7eb; display:flex; min-height:100vh; align-items:center; justify-content:center;}
  .card{max-width:520px;width:100%; background:#0f1115; border:1px solid #1f2937; border-radius:16px; padding:24px; text-align:center;}
  a{color:#93c5fd}</style></head>
  <body><div class="card"><h1>Unsubscribed ✅</h1><p style="color:#9ca3af">We’ve unsubscribed <b>${email}</b> from <b>${campaignName}</b>.</p>
  <p style="color:#9ca3af">If this was a mistake, reply to the email thread to re-engage.</p></div></body></html>`;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

export async function GET(_req: Request, { params }: { params: { t: string } }) {
  const admin = getServiceClient();
  const t = params.t;

  const { data: tok, error: tokErr } = await admin
    .from("unsubscribe_tokens")
    .select("email,campaign_id")
    .eq("token", t)
    .single();

  if (!tok || tokErr) {
    return new Response(
      htmlPage({ email: "unknown", campaignName: "this campaign", token: t, error: "Invalid or expired link." }),
      { headers: { "content-type": "text/html" } }
    );
  }

  const { data: camp } = await admin
    .from("campaigns")
    .select("name")
    .eq("id", tok.campaign_id)
    .single();

  return new Response(htmlPage({ email: tok.email, campaignName: camp?.name || "our campaign", token: t }), {
    headers: { "content-type": "text/html" }
  });
}

export async function POST(req: Request, { params }: { params: { t: string } }) {
  const admin = getServiceClient();
  const t = params.t;

  const body = await req.text();
  const pairs = new URLSearchParams(body);
  const reason = pairs.get("reason") || null;
  const details = pairs.get("details") || null;

  try {
    const { data: tok, error: tokErr } = await admin
      .from("unsubscribe_tokens")
      .select("email,campaign_id")
      .eq("token", t)
      .single();

    if (!tok || tokErr) {
      return new Response(
        htmlPage({ email: "unknown", campaignName: "this campaign", token: t, error: "Invalid or expired link." }),
        { headers: { "content-type": "text/html" }, status: 400 }
      );
    }

    await admin.rpc("record_unsubscribe", {
      p_token: t,
      p_reason: reason,
      p_details: details,
      p_promote_global: true
    });

    const { data: camp } = await admin
      .from("campaigns")
      .select("name")
      .eq("id", tok.campaign_id)
      .single();

    return new Response(htmlDone(tok.email, camp?.name || "our campaign"), {
      headers: { "content-type": "text/html" }
    });
  } catch (e) {
    console.error("unsubscribe error", e);
    return new Response(
      htmlPage({ email: "unknown", campaignName: "this campaign", token: t, error: "Something went wrong. Please try again." }),
      { headers: { "content-type": "text/html" }, status: 500 }
    );
  }
}

