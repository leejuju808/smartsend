import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { to, subject, body } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Resolve org, fetch outlook account
  const { data: orgRow } = await supabase.rpc("get_primary_org_for_user");
  const org_id = orgRow?.org_id;

  if (!org_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  const { data: acct } = await supabase.from("outlook_accounts").select("*").eq("org_id", org_id).single();
  if (!acct) return NextResponse.json({ error: "outlook not connected" }, { status: 400 });

  const payload = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }]
    },
    saveToSentItems: true
  };

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const err = await resp.text();
    return NextResponse.json({ error: err }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

