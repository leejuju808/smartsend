import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { renderTemplate } from "@/lib/templates/render";
import { getGmailAccessToken } from "@/lib/google/ensureToken";

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { to, leadId } = await req.json();
  if (!to) return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });

  const [{ data: camp }, { data: lead }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", params.id).single(),
    leadId ? supabase.from("leads").select("name,company,email").eq("id", leadId).single() : Promise.resolve({ data: null as any })
  ]);
  if (!camp) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const vars = {
    name: lead?.name ?? "there",
    company: lead?.company ?? "",
    email: lead?.email ?? to
  };
  const subject = renderTemplate(camp.subject_template || "", vars);
  const body = renderTemplate(camp.body_template || "", vars);

  const { accessToken } = await getGmailAccessToken();
  const mime = `To: ${to}
Subject: ${subject}
Content-Type: text/plain; charset="UTF-8"

${body}
`;
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(mime) })
  });
  const ok = r.ok;
  const j = ok ? await r.json() : { error: await r.text() };

  return NextResponse.json(ok ? { ok: true, id: j.id } : { ok: false, error: j.error ?? j });
}

