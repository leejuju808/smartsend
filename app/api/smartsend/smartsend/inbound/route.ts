import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { tgSend } from "@/lib/telegram";

// --- helpers ---
function normalizeHeaders(h: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) out[String(k).toLowerCase()] = String(v);
  return out;
}

async function resolveJobIdByProviderMsgId(parentMsgId: string | null) {
  if (!parentMsgId) return null;
  const sb = supabaseService();
  const { data } = await sb
    .from("sequence_jobs")
    .select("id")
    .eq("provider_message_id", parentMsgId)
    .limit(1);
  return data?.[0]?.id || null;
}

async function getJob(jobId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("sequence_jobs")
    .select("id, sequence_id, contact_email, reply_from, status")
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return data;
}

async function markReplied(jobId: string, payload: {
  from?: string, subject?: string, snippet?: string, replyMessageId?: string
}) {
  const sb = supabaseService();
  const { error } = await sb
    .from("sequence_jobs")
    .update({
      status: "replied",
      replied_at: new Date().toISOString(),
      reply_from: payload.from || null,
      reply_subject: payload.subject || null,
      reply_snippet: payload.snippet || null,
      reply_message_id: payload.replyMessageId || null
    })
    .eq("id", jobId);
  if (error) throw error;
}

async function cancelQueuedSiblings(sequence_id: string, contact_email: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("sequence_jobs")
    .update({ status: "canceled" })
    .eq("sequence_id", sequence_id)
    .eq("contact_email", contact_email)
    .eq("status", "queued")
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

// --- main ---
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";

  try {
    // ===== Resend JSON =====
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const type = body?.type || body?.event || "";
      if (!/email\.received/i.test(type)) {
        return NextResponse.json({ ok: true, note: "ignored event" });
      }
      const d = body?.data || {};
      const headers = normalizeHeaders(d.headers || {});

      const xJob = headers["x-smartsend-job"] || "";
      const inReply = headers["in-reply-to"] || headers["references"] || "";
      const replyMsgId = headers["message-id"] || null;

      const jobId =
        xJob ||
        (await resolveJobIdByProviderMsgId(inReply || null)) ||
        null;

      if (!jobId) return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });

      // mark replied
      await markReplied(jobId, {
        from: d.from?.address || d.from || undefined,
        subject: d.subject || undefined,
        snippet: (d.text || "").slice(0, 240),
        replyMessageId: replyMsgId || undefined
      });

      // fetch job to get seq + contact
      const job = await getJob(jobId);
      const canceled = await cancelQueuedSiblings(job.sequence_id, job.contact_email);

      // Notify Telegram (best-effort)
      const lines = [
        "<b>📨 Reply detected</b>",
        `From: <b>${(d.from?.name || "")}</b> <code>${d.from?.address || d.from || ""}</code>`,
        job.contact_email ? `Contact: <code>${job.contact_email}</code>` : null,
        d.subject ? `Subject: ${d.subject}` : null,
        canceled ? `Paused ${canceled} pending step(s)` : "No pending steps",
        `At: ${new Date().toLocaleString()}`
      ].filter(Boolean).join("\n");
      await tgSend(lines);

      return NextResponse.json({ ok: true, jobId, canceled });
    }

    // ===== SendGrid Parse (multipart) =====
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const from = String(form.get("from") || "");
      const subject = String(form.get("subject") || "");
      const text = String(form.get("text") || "");
      const rawHeaders = String(form.get("headers") || "");
      const headers: Record<string, string> = {};
      rawHeaders.split(/\r?\n/).forEach(line => {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });

      const xJob = headers["x-smartsend-job"] || "";
      const inReply = headers["in-reply-to"] || headers["references"] || "";
      const replyMsgId = headers["message-id"] || null;

      const jobId =
        xJob ||
        (await resolveJobIdByProviderMsgId(inReply || null)) ||
        null;

      if (!jobId) return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });

      await markReplied(jobId, {
        from,
        subject,
        snippet: text.slice(0, 240),
        replyMessageId: replyMsgId || undefined
      });

      const job = await getJob(jobId);
      const canceled = await cancelQueuedSiblings(job.sequence_id, job.contact_email);

      const lines = [
        "<b>📨 Reply detected</b>",
        `From: <code>${from}</code>`,
        job.contact_email ? `Contact: <code>${job.contact_email}</code>` : null,
        subject ? `Subject: ${subject}` : null,
        canceled ? `Paused ${canceled} pending step(s)` : "No pending steps",
        `At: ${new Date().toLocaleString()}`
      ].filter(Boolean).join("\n");
      await tgSend(lines);

      return NextResponse.json({ ok: true, jobId, canceled });
    }

    return NextResponse.json({ ok: false, error: "Unsupported content-type" }, { status: 415 });
  } catch (e: any) {
    console.error("INBOUND_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}