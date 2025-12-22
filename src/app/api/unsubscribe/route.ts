import { verifyUnsubToken } from "@/lib/unsub";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const oneClick = url.searchParams.get("o") === "1";
  const payload = verifyUnsubToken(token);

  if (!payload) {
    return new Response("Invalid token", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  if (oneClick) {
    const admin = getServiceClient();
    const { error } = await admin.rpc("upsert_unsubscribe", {
      p_campaign: payload.c,
      p_email: payload.e,
      p_source: "link",
      p_reason: payload.r ?? "one-click"
    });

    if (error) {
      return new Response("Error", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    return new Response("You're unsubscribed. ✅", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:system-ui;margin:40px;color:#111}button{padding:10px 16px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer}form{margin-top:24px}</style>
  <h1>Unsubscribe</h1>
  <p>Stop all emails for this campaign?</p>
  <form method="post">
    <input type="hidden" name="t" value="${token}" />
    <button type="submit">Unsubscribe</button>
  </form>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let token = "";

  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      token = typeof body?.t === "string" ? body.t : "";
    } catch {
      token = "";
    }
  } else {
    try {
      const form = await req.formData();
      const val = form.get("t");
      token = typeof val === "string" ? val : "";
    } catch {
      const text = await req.text();
      const params = new URLSearchParams(text);
      token = params.get("t") ?? "";
    }
  }

  const payload = verifyUnsubToken(token);

  if (!payload) {
    return new Response("Invalid token", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const admin = getServiceClient();
  const { error } = await admin.rpc("upsert_unsubscribe", {
    p_campaign: payload.c,
    p_email: payload.e,
    p_source: "link",
    p_reason: payload.r ?? "confirm-click"
  });

  if (error) {
    return new Response(error.message ?? "Error", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  return new Response("You're unsubscribed. ✅", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}
