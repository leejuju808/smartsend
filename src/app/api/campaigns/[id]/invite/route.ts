import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return new Response("email is required", { status: 400 });
  }
  const allowedRoles = new Set(["owner", "editor", "viewer"]);
  const role = allowedRoles.has(body.role) ? body.role : "viewer";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Supabase environment variables are not configured", { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/invite_member`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_campaign: params.id,
      p_email: email,
      p_role: role,
    }),
  });

  const headers = new Headers(response.headers);
  const clone = response.clone();
  const text = await clone.text();
  let body: string = text;
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
    body = JSON.stringify(parsed);
  } catch {
    // non-json response, leave as text
  }

  let inviteId: string | null = null;
  if (typeof parsed === "string") {
    inviteId = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (typeof first === "string") {
        inviteId = first;
      } else if (first && typeof first === "object" && "id" in first && typeof first.id === "string") {
        inviteId = first.id;
      }
    } else if ("data" in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).data === "string") {
      inviteId = (parsed as Record<string, string>).data;
    } else if ("id" in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).id === "string") {
      inviteId = (parsed as Record<string, string>).id;
    } else if ("invite_member" in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).invite_member === "string") {
      inviteId = (parsed as Record<string, string>).invite_member;
    }
  } else if (!parsed) {
    const trimmed = text.trim().replace(/"/g, "");
    inviteId = trimmed.length === 36 ? trimmed : null;
  }

  if (response.ok && inviteId) {
    const tokenResp = await fetch(
      `${supabaseUrl}/rest/v1/campaign_invites?id=eq.${inviteId}&select=token`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (tokenResp.ok) {
      const tokenJson = await tokenResp.json().catch(() => null);
      const token = Array.isArray(tokenJson) && tokenJson.length > 0 ? tokenJson[0]?.token : null;
      if (typeof token === "string" && token.length > 0) {
        body = JSON.stringify({ id: inviteId, token });
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Response(body, { status: response.status, headers });
}

