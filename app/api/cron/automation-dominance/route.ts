// Block 268200 — SmartSend Automation Dominance Sprint
// CRON: 15-minute hot-lead guardrail + Day 2/4/7 follow-up chain (stops on reply)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";
import { sendEmail } from "@/lib/email";
import { insertUnifiedMessage, getCompanyIdFromWorkspace } from "@/lib/unified-messages";

type TimeOfDay = "morning" | "midday" | "evening";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function requireCronAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const xCronSecret = req.headers.get("x-cron-secret") || "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return true; // best-effort in dev
  if (authHeader === `Bearer ${expected}`) return true;
  if (xCronSecret === expected) return true;
  return false;
}

function getTimeOfDayForTimezone(now: Date, tz: string): TimeOfDay {
  try {
    const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const h = local.getHours();
    if (h < 11) return "morning";
    if (h < 17) return "midday";
    return "evening";
  } catch {
    // fallback UTC
    const h = now.getUTCHours();
    if (h < 11) return "morning";
    if (h < 17) return "midday";
    return "evening";
  }
}

function holdingCopy(tod: TimeOfDay): string {
  // Neutral, non-salesy, keeps the job warm.
  if (tod === "evening") return "Got it — we’ll take a look and follow up tomorrow morning.";
  if (tod === "midday") return "Got it — we’ll follow up shortly.";
  return "Got it — we’ll take a look and follow up shortly.";
}

function followupCopy(step: 1 | 2 | 3, tod: TimeOfDay): string {
  // Stops on reply; polite and short; no pressure.
  const suffix =
    tod === "evening"
      ? " If tonight’s not a good time, we can confirm tomorrow morning."
      : "";

  if (step === 1) return `Quick check-in — do you still want us to take a look? Reply with the address and a good time.${suffix}`;
  if (step === 2) return `Just circling back — happy to help. Want us to swing by or do a quick call?${suffix}`;
  return `Last quick note — should we close this out, or do you still need a hand?${suffix}`;
}

function ms(minutes: number) {
  return minutes * 60 * 1000;
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

async function getWorkspaceTimezone(sb: ReturnType<typeof serviceClient>, workspaceId: string): Promise<string> {
  const { data } = await sb
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const tz =
    (data as any)?.settings?.workspace?.default_timezone ||
    (data as any)?.settings?.workspace?.timezone ||
    "America/Los_Angeles";
  return String(tz || "America/Los_Angeles");
}

async function resolveThreadLastTimes(
  sb: ReturnType<typeof serviceClient>,
  threadId: string
): Promise<{ lastInboundAt: string | null; lastOutboundAt: string | null }> {
  const { data: rows } = await sb
    .from("inbox_messages")
    .select("direction, received_at")
    .eq("thread_id", threadId)
    .order("received_at", { ascending: false })
    .limit(50);

  let lastInboundAt: string | null = null;
  let lastOutboundAt: string | null = null;
  for (const r of rows || []) {
    const dir = (r as any).direction;
    const at = (r as any).received_at as string | null;
    if (!at) continue;
    if (!lastInboundAt && dir === "inbound") lastInboundAt = at;
    if (!lastOutboundAt && dir === "outbound") lastOutboundAt = at;
    if (lastInboundAt && lastOutboundAt) break;
  }
  return { lastInboundAt, lastOutboundAt };
}

async function pickNotifyUserId(
  sb: ReturnType<typeof serviceClient>,
  workspaceId: string,
  thread: any
): Promise<string | null> {
  const assigned = thread?.assigned_to_user_id || thread?.assigned_to;
  if (assigned) return String(assigned);

  const { data: owner } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return owner?.user_id ? String(owner.user_id) : null;
}

async function createNotificationBestEffort(sb: ReturnType<typeof serviceClient>, params: {
  user_id: string;
  workspace_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}) {
  try {
    await sb.from("notifications").insert({
      user_id: params.user_id,
      workspace_id: params.workspace_id,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
    } as any);
  } catch {
    // swallow
  }
}

async function sendAutomatedSms(sb: ReturnType<typeof serviceClient>, args: {
  workspaceId: string;
  thread: any;
  toPhone: string;
  body: string;
  automationTag: "guardrail_hold" | "followup_day2" | "followup_day4" | "followup_day7";
}) {
  const normalizedTo = normalizePhoneNumber(args.toPhone);
  if (!normalizedTo) throw new Error("invalid_phone");

  const { data: ws } = await sb
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_id", args.workspaceId)
    .single();

  const smsCfg = (ws as any)?.settings?.sms;
  if (!smsCfg?.phone_number) throw new Error("sms_not_configured");

  const provider = smsCfg.provider || "twilio";
  const credentials = smsCfg.credentials || {};
  const providerConfig = {
    provider: provider as "twilio" | "nexmo" | "telnyx",
    credentials: {
      accountSid: credentials.account_sid || credentials.accountSid || process.env.TWILIO_ACCOUNT_SID,
      authToken: credentials.auth_token || credentials.authToken || process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: smsCfg.phone_number,
    },
  };

  const res = await sendSMS(normalizedTo, args.body, providerConfig as any);
  if (!res.success) throw new Error(res.error || "sms_send_failed");

  // Log in inbox_messages
  const nowIso = new Date().toISOString();
  const { data: msg } = await sb
    .from("inbox_messages")
    .insert({
      thread_id: args.thread.id,
      campaign_id: args.thread.campaign_id ?? null,
      contact_id: args.thread.contact_id ?? null,
      channel: "sms",
      from_phone: smsCfg.phone_number,
      to_phone: normalizedTo,
      body_raw: args.body,
      body_clean: args.body,
      received_at: nowIso,
      sms_provider_message_id: res.providerMessageId || res.messageId || null,
      sms_delivery_status: "queued",
      status: "read",
      automation_tag: args.automationTag,
      automation_meta: { source: "cron", v: 1 },
    } as any)
    .select("id")
    .maybeSingle();

  // Update thread contact timestamps and automation state
  await sb
    .from("inbox_threads")
    .update({
      last_message_at: nowIso,
      last_channel: "sms",
      last_contact_method: "sms",
      last_contact_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("id", args.thread.id);

  // Unified messages mirror (best-effort)
  try {
    const companyId = await getCompanyIdFromWorkspace(args.workspaceId);
    if (companyId) {
      await insertUnifiedMessage({
        company_id: companyId,
        lead_id: null,
        channel: "sms",
        direction: "outgoing",
        sender: "SmartSend",
        sender_phone: smsCfg.phone_number,
        body: args.body,
        metadata: {
          workspace_id: args.workspaceId,
          thread_id: args.thread.id,
          inbox_message_id: msg?.id || null,
          automation_tag: args.automationTag,
        },
        external_id: res.providerMessageId || res.messageId || null,
      });
    }
  } catch {
    // swallow
  }
}

async function sendAutomatedEmail(sb: ReturnType<typeof serviceClient>, args: {
  workspaceId: string;
  thread: any;
  toEmail: string;
  subject: string;
  text: string;
  automationTag: "guardrail_hold" | "followup_day2" | "followup_day4" | "followup_day7";
}) {
  const nowIso = new Date().toISOString();
  const sendResult = await sendEmail({
    from: process.env.SMARTSEND_FROM || "SmartSend <noreply@smartsend.ai>",
    to: args.toEmail,
    subject: args.subject,
    text: args.text,
  });
  if (!sendResult.success) throw new Error(sendResult.error || "email_send_failed");

  const { data: msg } = await sb
    .from("inbox_messages")
    .insert({
      thread_id: args.thread.id,
      campaign_id: args.thread.campaign_id ?? null,
      contact_id: args.thread.contact_id ?? null,
      channel: "email",
      from_email: (process.env.SMARTSEND_FROM || "noreply@smartsend.ai").replace(/^.*</, "").replace(/>.*$/, ""),
      to_email: args.toEmail,
      subject: args.subject,
      body_raw: args.text,
      body_clean: args.text,
      received_at: nowIso,
      status: "read",
      automation_tag: args.automationTag,
      automation_meta: { source: "cron", v: 1 },
    } as any)
    .select("id")
    .maybeSingle();

  await sb
    .from("inbox_threads")
    .update({
      last_message_at: nowIso,
      last_channel: "email",
      last_contact_method: "email",
      last_contact_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("id", args.thread.id);

  try {
    const companyId = await getCompanyIdFromWorkspace(args.workspaceId);
    if (companyId) {
      await insertUnifiedMessage({
        company_id: companyId,
        lead_id: null,
        channel: "email",
        direction: "outgoing",
        sender: "SmartSend",
        sender_email: null,
        body: args.text,
        subject: args.subject,
        metadata: {
          workspace_id: args.workspaceId,
          thread_id: args.thread.id,
          inbox_message_id: msg?.id || null,
          automation_tag: args.automationTag,
        },
      });
    }
  } catch {
    // swallow
  }
}

export async function POST(req: NextRequest) {
  if (!requireCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = serviceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Pull only open + hot/warm threads (owner attention filter)
  const { data: threads, error } = await sb
    .from("inbox_threads")
    .select(
      `
      id,
      campaign_id,
      contact_id,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      assigned_to_user_id,
      engagement_level,
      lead_stage,
      status,
      last_channel,
      last_contact_at,
      autoguardrail_last_inbound_at,
      autoguardrail_sent_at,
      autofollowup_anchor_at,
      autofollowup_step,
      autofollowup_last_sent_at,
      campaigns:campaign_id (
        workspace_id
      )
    `
    )
    .eq("status", "open")
    .in("engagement_level", ["hot", "warm"])
    .not("lead_stage", "in", '("won","lost")')
    .order("updated_at", { ascending: false })
    .limit(150);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let guardrailSent = 0;
  let followupsSent = 0;
  let stoppedChains = 0;
  const errors: Array<{ thread_id: string; error: string }> = [];

  for (const t of threads || []) {
    const thread = t as any;
    const workspaceId = thread?.campaigns?.workspace_id as string | undefined;
    if (!workspaceId) continue;

    try {
      const tz = await getWorkspaceTimezone(sb, workspaceId);
      const tod = getTimeOfDayForTimezone(now, tz);
      const { lastInboundAt, lastOutboundAt } = await resolveThreadLastTimes(sb, thread.id);

      // If homeowner replied after the chain anchor, stop instantly.
      if (thread.autofollowup_anchor_at && lastInboundAt) {
        const anchorMs = new Date(thread.autofollowup_anchor_at).getTime();
        const inboundMs = new Date(lastInboundAt).getTime();
        if (Number.isFinite(anchorMs) && Number.isFinite(inboundMs) && inboundMs > anchorMs) {
          await sb
            .from("inbox_threads")
            .update({
              autofollowup_anchor_at: null,
              autofollowup_step: 0,
              autofollowup_last_sent_at: null,
              next_action_at: null,
              updated_at: nowIso,
            } as any)
            .eq("id", thread.id);
          stoppedChains += 1;
          continue;
        }
      }

      const effectiveLastOutbound = (thread.last_contact_at as string | null) || lastOutboundAt;

      // -------------------------------------------------------------------
      // 1) Auto-Response Guardrail (Fail-Safe) — 15 minutes after hot/warm inbound
      // -------------------------------------------------------------------
      const inboundMs = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
      const outboundMs = effectiveLastOutbound ? new Date(effectiveLastOutbound).getTime() : NaN;

      const needsGuardrail =
        !!lastInboundAt &&
        Number.isFinite(inboundMs) &&
        (!effectiveLastOutbound || (Number.isFinite(outboundMs) && outboundMs < inboundMs)) &&
        now.getTime() - inboundMs >= ms(15) &&
        String(thread.autoguardrail_last_inbound_at || "") !== String(lastInboundAt);

      if (needsGuardrail) {
        const body = holdingCopy(tod);
        const channel = (thread.last_channel as string) || "sms";

        if (channel === "sms") {
          const toPhone = thread.homeowner_phone as string | null;
          if (toPhone) {
            await sendAutomatedSms(sb, {
              workspaceId,
              thread,
              toPhone,
              body,
              automationTag: "guardrail_hold",
            });
          }
        } else {
          const toEmail = thread.homeowner_email as string | null;
          if (toEmail) {
            await sendAutomatedEmail(sb, {
              workspaceId,
              thread,
              toEmail,
              subject: "Quick update",
              text: body,
              automationTag: "guardrail_hold",
            });
          }
        }

        await sb
          .from("inbox_threads")
          .update({
            autoguardrail_last_inbound_at: lastInboundAt,
            autoguardrail_sent_at: nowIso,
            autoguardrail_channel: channel,
            // start chain off the guardrail send
            autofollowup_anchor_at: nowIso,
            autofollowup_step: 0,
            autofollowup_last_sent_at: null,
            next_action_at: new Date(now.getTime() + days(2)).toISOString(),
            updated_at: nowIso,
          } as any)
          .eq("id", thread.id);

        // Notify roofer (best-effort)
        const notifyUserId = await pickNotifyUserId(sb, workspaceId, thread);
        if (notifyUserId) {
          await createNotificationBestEffort(sb, {
            user_id: notifyUserId,
            workspace_id: workspaceId,
            type: thread.engagement_level === "hot" ? "hot_lead" : "warm_lead",
            title: "SmartSend sent a holding reply (15-minute fail-safe)",
            body: `${thread.homeowner_name || "Homeowner"} replied and SmartSend kept it warm. Reply when you’re free.`,
            link: `/inbox/${thread.id}`,
          });
        }

        guardrailSent += 1;
        continue; // don’t also send follow-up in same run
      }

      // -------------------------------------------------------------------
      // 2) Error-Free Follow-Up Chain — Day 2 / Day 4 / Day 7 (stops on reply)
      // -------------------------------------------------------------------
      const anchor = (thread.autofollowup_anchor_at as string | null) || effectiveLastOutbound;
      const step = Number(thread.autofollowup_step || 0) as 0 | 1 | 2 | 3;

      // If we have no anchor or homeowner already replied after last outbound, skip.
      if (!anchor) continue;
      const anchorMs = new Date(anchor).getTime();
      if (!Number.isFinite(anchorMs)) continue;

      if (lastInboundAt) {
        const inboundAfterAnchor = new Date(lastInboundAt).getTime() > anchorMs;
        if (inboundAfterAnchor) continue;
      }

      // Ensure anchor is stored once (idempotent)
      if (!thread.autofollowup_anchor_at) {
        await sb
          .from("inbox_threads")
          .update({
            autofollowup_anchor_at: anchor,
            autofollowup_step: step,
            updated_at: nowIso,
          } as any)
          .eq("id", thread.id);
      }

      const dueAt =
        step === 0
          ? anchorMs + days(2)
          : step === 1
          ? anchorMs + days(4)
          : step === 2
          ? anchorMs + days(7)
          : null;

      if (!dueAt || now.getTime() < dueAt) continue;

      const nextStep = (step + 1) as 1 | 2 | 3;
      const msg = followupCopy(nextStep, tod);
      const channel = (thread.last_channel as string) || "sms";

      if (channel === "sms") {
        const toPhone = thread.homeowner_phone as string | null;
        if (!toPhone) continue;
        await sendAutomatedSms(sb, {
          workspaceId,
          thread,
          toPhone,
          body: msg,
          automationTag: nextStep === 1 ? "followup_day2" : nextStep === 2 ? "followup_day4" : "followup_day7",
        });
      } else {
        const toEmail = thread.homeowner_email as string | null;
        if (!toEmail) continue;
        await sendAutomatedEmail(sb, {
          workspaceId,
          thread,
          toEmail,
          subject: "Quick check-in",
          text: msg,
          automationTag: nextStep === 1 ? "followup_day2" : nextStep === 2 ? "followup_day4" : "followup_day7",
        });
      }

      const nextAction =
        nextStep === 1 ? new Date(anchorMs + days(4)).toISOString()
        : nextStep === 2 ? new Date(anchorMs + days(7)).toISOString()
        : null;

      await sb
        .from("inbox_threads")
        .update({
          autofollowup_anchor_at: anchor,
          autofollowup_step: nextStep,
          autofollowup_last_sent_at: nowIso,
          next_action_at: nextAction,
          updated_at: nowIso,
        } as any)
        .eq("id", thread.id);

      followupsSent += 1;
    } catch (e: any) {
      errors.push({ thread_id: String((t as any).id), error: String(e?.message || e) });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      scanned: (threads || []).length,
      guardrail_sent: guardrailSent,
      followups_sent: followupsSent,
      chains_stopped_on_reply: stoppedChains,
      errors: errors.slice(0, 20),
    },
    { status: 200 }
  );
}








