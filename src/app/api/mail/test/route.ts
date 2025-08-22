import { NextResponse } from "next/server";
import { sendEmail } from "@/server/email";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) {
  return new URL(req.url).searchParams.get("userId");
}

export async function POST(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to } = await req.json().catch(() => ({}));
  const { data: mb } = await supabaseAdmin
    .from("mailboxes")
    .select("*")
    .eq("owner", userId)
    .single();
  if (!mb) return NextResponse.json({ error: "No mailbox" }, { status: 400 });

  const recipient = to || (mb as any).from_email;

  try {
    await sendEmail({
      owner: userId,
      to: recipient,
      subject: "SmartSend test — Delivered ✅",
      html: "<p>Your mailbox is connected and ready to send.</p>",
      headers: { "X-SmartSend-Test": "1" },
    });
    await supabaseAdmin
      .from("mailboxes")
      .update({ verified: true, updated_at: new Date().toISOString() })
      .eq("owner", userId);
    return NextResponse.json({ ok: true, to: recipient });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

