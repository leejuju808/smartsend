import crypto from "crypto";
import { supabaseAdmin } from "@/server/supabase";
import { newTrackingKey } from "@/lib/tracking";

const SITE = process.env.NEXT_PUBLIC_SITE_URL!;
const TRACK_SECRET = process.env.TRACKING_SECRET || "change_me_please";
const MSG_DOMAIN = process.env.MAIL_MESSAGE_ID_DOMAIN || new URL(SITE).host;

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(input: string) {
  return base64UrlEncode(crypto.createHmac("sha256", TRACK_SECRET).update(input).digest());
}

export function makeMessageId() {
  const rnd = crypto.randomBytes(12).toString("hex");
  const ts = Date.now().toString(36);
  return `<${rnd}.${ts}@${MSG_DOMAIN}>`;
}

export function makePixelToken(outboundId: string) {
  const body = base64UrlEncode(Buffer.from(outboundId));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export async function ensureOutboundRecord(params: {
  owner: string; leadId: string; sequenceId: string; stepNo: number;
}) {
  const { owner, leadId, sequenceId, stepNo } = params;
  const { data: row, error } = await supabaseAdmin
    .from("outbound_messages")
    .insert({ owner, lead_id: leadId, sequence_id: sequenceId, step_no: stepNo, tracking_key: newTrackingKey() })
    .select("id, tracking_key")
    .single();
  if (error) throw error;
  const outboundId = (row as any).id as string;
  const trackingKey = (row as any).tracking_key as string;
  const pixelToken = makePixelToken(outboundId);
  await supabaseAdmin.from("outbound_messages").update({ pixel_token: pixelToken }).eq("id", outboundId);
  return { outboundId, pixelToken, trackingKey };
}

export function trackingPixelTag(token: string) {
  return `<img src="${SITE}/o/${encodeURIComponent(token)}.png" width="1" height="1" style="display:none" alt="" />`;
}

