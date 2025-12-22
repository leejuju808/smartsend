import { NextResponse } from "next/server";
import { normalizeSendGrid } from "@/lib/replies/normalize";
import { verifySecret, requireUserIdFromQuery } from "@/lib/webhook/auth";
import { createClient } from "@supabase/supabase-js";
import { forwardToDetector } from "@/lib/replies/forward";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    verifySecret(req, process.env.WEBHOOK_SECRET_SENDGRID);
    const ownerUserId = requireUserIdFromQuery(req);

    const normalized = await normalizeSendGrid(req);

    // Log inbound
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: inserted, error: insErr } = await supabase
      .from("inbound_messages")
      .insert({
        provider: "sendgrid",
        owner_user_id: ownerUserId,
        message_id: normalized.messageId,
        sender_email: normalized.sender,
        subject: normalized.subject,
        body_text: normalized.bodyText,
        raw_payload: null, // optional: we can't read the body twice if multipart; omit to keep it simple
        processed_status: "received",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Forward to detector
    const res = await forwardToDetector(
      process.env.SUPABASE_EDGE_FN_DETECTOR_URL!,
      ownerUserId,
      normalized,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update status
    await supabase
      .from("inbound_messages")
      .update({
        processed_status: "forwarded",
        detector_status: res?.status || null,
      })
      .eq("id", inserted.id);

    return NextResponse.json({ ok: true, detector: res });
  } catch (e: any) {
    const status = e?.statusCode || 500;
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status });
  }
}
