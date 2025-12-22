import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return new Response("token is required", { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return new Response("Supabase environment variables are not configured", { status: 500 });
  }

  const headers: Record<string, string> = {
    apikey: anonKey,
    "Content-Type": "application/json",
  };

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/accept_invite`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_token: token }),
  });

  const text = await response.text();
  const headers = new Headers(response.headers);
  return new Response(text, { status: response.status, headers });
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data, error } = await supabase.rpc("accept_campaign_invite", { p_token: token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload?.campaign_id) {
    return NextResponse.json({ error: "Invite invalid or expired" }, { status: 400 });
  }

  try {
    await supabase.rpc("log_event", {
      p_campaign: payload.campaign_id,
      p_thread: null,
      p_lead: null,
      p_user: null,
      p_kind: "invite_accepted",
      p_note: `role=${payload.role ?? ""}`,
      p_meta: {},
    });
  } catch (logErr) {
    console.error("invite accept log_event failed", logErr);
  }

  return NextResponse.json({ ok: true, campaign_id: payload.campaign_id, role: payload.role });
}
