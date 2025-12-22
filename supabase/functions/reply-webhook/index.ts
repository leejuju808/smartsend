// /supabase/functions/reply-webhook/index.ts
// Accepts webhook payloads from Gmail/Outlook, filters auto-replies, and marks threads as replied

import "jsr:@supabase/functions@1.4.0/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Incoming = {
  workspace_id: string;           // your tenant/workspace
  thread_id: string;              // provider thread/conversation id
  message_id?: string;            // provider message id
  subject?: string;
  from?: string;
  to?: string;
  snippet?: string;
  text?: string;                  // plain text body (recommended)
  html?: string;                  // fallback (we won't parse HTML)
  provider: "gmail" | "outlook";  // for future branching
  received_at?: string;           // ISO string
  headers?: Record<string, string>;
  hmac?: string;                  // optional HMAC for verification
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!; // set in project settings

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Basic HMAC verification
async function verifyHmac(raw: string, sent?: string) {
  if (!WEBHOOK_SECRET) return true; // allow if not configured (dev)
  if (!sent) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(sent),
    new TextEncoder().encode(raw)
  );
  return ok;
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

// Simple auto-reply / OOO heuristic
function looksLikeAutoReply(p: Incoming): boolean {
  const h = normalizeHeaders(p.headers);
  const subject = (p.subject || "").toLowerCase();
  const body = (p.text || p.snippet || "").toLowerCase();

  const autoHdrs = [
    "x-autoreply",
    "x-auto-response-suppress",
    "auto-submitted",
    "x-ms-exchange-organization-autosubmitted",
  ];
  if (autoHdrs.some((k) => h[k] && h[k] !== "no")) return true;

  const subjectHints = ["out of office", "automatic reply", "auto reply", "autoreply", "vacation"];
  if (subjectHints.some((s) => subject.includes(s))) return true;

  const bodyHints = [
    "i am currently out of the office",
    "this is an automated message",
    "thank you for your email. i am away",
    "your message has been received",
    "do not reply to this email",
  ];
  if (bodyHints.some((s) => body.includes(s))) return true;

  return false;
}

function normalizeHeaders(h?: Record<string, string>) {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v).toLowerCase();
  return out;
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();
    const payload = JSON.parse(raw) as Incoming;

    const ok = await verifyHmac(raw, payload.hmac);
    if (!ok) return new Response("Invalid signature", { status: 401 });

    // Ignore auto replies
    if (looksLikeAutoReply(payload)) {
      return new Response(JSON.stringify({ status: "ignored_auto_reply" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mark most recent log in this thread as replied
    const replyTs = payload.received_at ?? new Date().toISOString();

    // Find latest log for this thread/workspace
    const { data: latest, error: latestErr } = await supabase
      .from("email_logs")
      .select("id, lead_id, status")
      .eq("thread_id", payload.thread_id)
      .eq("workspace_id", payload.workspace_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) throw latestErr;
    if (!latest) {
      // No existing log — create a minimal replied row so dashboard still reflects truth
      const { error: insErr } = await supabase.from("email_logs").insert({
        workspace_id: payload.workspace_id,
        thread_id: payload.thread_id,
        message_id: payload.message_id ?? crypto.randomUUID(),
        status: "replied",
        replied_at: replyTs,
        meta: { provider: payload.provider, from: payload.from, subject: payload.subject },
      } as any);
      if (insErr) throw insErr;
    } else {
      // Update existing thread row to replied
      const { error: updErr } = await supabase
        .from("email_logs")
        .update({
          status: "replied",
          replied_at: replyTs,
          message_id: payload.message_id ?? null,
        })
        .eq("id", latest.id);
      if (updErr) throw updErr;
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("Server error", { status: 500 });
  }
});