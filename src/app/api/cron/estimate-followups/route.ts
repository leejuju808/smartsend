import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendHtmlEmail } from "@/lib/notify/mailer";
import { assertValidRecipientEmail, computeSendIdempotencyKey } from "@/lib/reliability/delivery";

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAuthorityEmailSignature(opts: { companyName: string; serviceArea?: string | null }) {
  const companyName = opts.companyName;
  const serviceArea = (opts.serviceArea || "").trim() || "your area";
  return `
    <!-- smartsend_authority_signature_v1 -->
    <div style="margin-top:16px;">
      <div style="font-size:14px;color:#111;font-weight:600;">${escapeHtml(companyName)}</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">Local Roofing Specialists</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">Serving ${escapeHtml(serviceArea)} &amp; Surrounding Areas</div>
    </div>
  `;
}

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

function renderMessage(step: number, name: string | null) {
  const safeName = (name || "").trim() || "there";

  if (step === 1) {
    return `Hi ${safeName}, just checking in to see if you had any questions about the roofing estimate I sent over. Happy to help.`;
  }
  if (step === 2) {
    return `Wanted to follow up on the estimate in case timing matters — we’re booking out fast and wanted to make sure you had a spot.`;
  }
  return `Last check-in before we close this out. Next step is scheduling once approved — reply YES to approve or send any questions and we’ll handle it.`;
}

function computeNextDue(sentAtISO: string | null, nextStep: number) {
  if (!sentAtISO) return null;
  const sentAt = new Date(sentAtISO);
  if (Number.isNaN(sentAt.getTime())) return null;
  const offsetsDays = [2, 5, 9];
  const days = offsetsDays[nextStep - 1];
  if (!days) return null;
  return new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowISO = new Date().toISOString();
  const scaleCache = new Map<string, { tier: string }>();
  const followupsSentTodayCache = new Map<string, number>();
  const workspaceOutreachRunningCache = new Map<string, boolean>();

  // Fetch due estimates
  const { data: dueEstimates, error } = await supabaseAdmin
    .from("estimates")
    .select(
      `
      id,
      company_id,
      status,
      sent_at,
      approved_at,
      sent_to_email,
      followup_status,
      next_followup_at,
      company:roofing_companies(id, name, workspace_id),
      homeowner:homeowners(name,email)
    `
    )
    .eq("followup_status", "active")
    .lte("next_followup_at", nowISO)
    .limit(50);

  if (error) {
    console.error("Estimate followups cron: failed to load due estimates", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const est of dueEstimates || []) {
    processed++;

    // Stop immediately if approved
    if ((est as any).status === "approved" || (est as any).approved_at) {
      await supabaseAdmin
        .from("estimates")
        .update({ followup_status: "completed", next_followup_at: null })
        .eq("id", (est as any).id);
      skipped++;
      continue;
    }

    const toEmail =
      String((est as any).sent_to_email || (est as any).homeowner?.email || "").trim();

    const emailCheck = assertValidRecipientEmail(toEmail);
    if (!emailCheck.ok) {
      // Can't send; pause to avoid infinite retries.
      await supabaseAdmin
        .from("estimates")
        .update({ followup_status: "paused", next_followup_at: null })
        .eq("id", (est as any).id);

      await supabaseAdmin.rpc("log_delivery_attempt", {
        p_company_id: String((est as any).company_id || (est as any).company?.id || ""),
        p_related_id: (est as any).id,
        p_message_type: "followup",
        p_status: "blocked",
        p_error_message: "Follow-up not sent — email address is invalid or missing.",
      });

      skipped++;
      continue;
    }

    const { count: followupsSent, error: countErr } = await supabaseAdmin
      .from("followups")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", (est as any).id);

    if (countErr) {
      console.error("Estimate followups cron: failed to count followups", countErr);
      skipped++;
      continue;
    }

    const step = (followupsSent ?? 0) + 1;

    if (step > 3) {
      await supabaseAdmin
        .from("estimates")
        .update({ followup_status: "stale", next_followup_at: null })
        .eq("id", (est as any).id);
      skipped++;
      continue;
    }

    const companyName = (est as any).company?.name || "SmartSend";
    const homeownerName = (est as any).homeowner?.name || null;
    const messageText = renderMessage(step, homeownerName);

    const companyId = String((est as any).company_id || (est as any).company?.id || "");
    if (!companyId) {
      skipped++;
      continue;
    }

    // BLOCK 269500: Workspace-wide outreach gate (SmartSend ON/OFF)
    // If the workspace is paused, follow-ups stop.
    const wsId = String((est as any).company?.workspace_id || "");
    if (wsId) {
      let running = workspaceOutreachRunningCache.get(wsId);
      if (running === undefined) {
        try {
          const { data: ws } = await supabaseAdmin
            .from("workspaces")
            .select("outreach_state")
            .eq("id", wsId)
            .maybeSingle();
          running = String((ws as any)?.outreach_state || "running") === "running";
        } catch {
          running = true; // best-effort: don't block if we can't read
        }
        workspaceOutreachRunningCache.set(wsId, running);
      }
      if (!running) {
        await supabaseAdmin.rpc("log_delivery_attempt", {
          p_company_id: companyId,
          p_related_id: (est as any).id,
          p_message_type: "followup",
          p_status: "blocked",
          p_error_message: "Follow-up not sent — SmartSend is paused (workspace OFF).",
        });
        skipped++;
        continue;
      }
    }

    // Scale Gate v1: if Scale Locked, cap follow-up sends/day (no overrides)
    let tier = "locked";
    const cachedScale = scaleCache.get(companyId);
    if (cachedScale) {
      tier = cachedScale.tier;
    } else {
      const { data: scale, error: scaleErr } = await supabaseAdmin.rpc("compute_scale_readiness", {
        p_company_id: companyId,
        p_persist: false,
      });
      if (scaleErr) {
        console.error("Estimate followups cron: scale status RPC failed", scaleErr);
        skipped++;
        continue;
      }
      const row = Array.isArray(scale) ? scale[0] : scale;
      tier = String((row as any)?.tier || "locked");
      scaleCache.set(companyId, { tier });
    }

    if (tier === "locked") {
      let sentToday = followupsSentTodayCache.get(companyId);
      if (sentToday === undefined) {
        const { count, error: sentErr } = await supabaseAdmin
          .from("delivery_logs")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("message_type", "followup")
          .eq("status", "sent")
          .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
        if (sentErr) {
          console.error("Estimate followups cron: failed to count followups sent today", sentErr);
          skipped++;
          continue;
        }
        sentToday = count ?? 0;
        followupsSentTodayCache.set(companyId, sentToday);
      }

      const DAILY_FOLLOWUP_CAP_LOCKED = 10;
      if ((sentToday ?? 0) >= DAILY_FOLLOWUP_CAP_LOCKED) {
        // Enforce immediately: defer next attempt to tomorrow and log a blocked attempt.
        await supabaseAdmin
          .from("estimates")
          .update({ next_followup_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
          .eq("id", (est as any).id);

        await supabaseAdmin.rpc("log_delivery_attempt", {
          p_company_id: companyId,
          p_related_id: (est as any).id,
          p_message_type: "followup",
          p_status: "blocked",
          p_error_message: "Follow-up not sent — Scale Locked (follow-ups capped).",
        });

        skipped++;
        continue;
      }
    }

    // LOCKED RULE: subscription.status must be active (company owner)
    const { data: companyRow } = await supabaseAdmin
      .from("roofing_companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();

    if (companyRow?.owner_id) {
      const { data: sub } = await supabaseAdmin
        .from("billing_subscriptions")
        .select("status, current_period_end")
        .eq("user_id", companyRow.owner_id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub || sub.status !== "active") {
        await supabaseAdmin.rpc("log_delivery_attempt", {
          p_company_id: companyId,
          p_related_id: (est as any).id,
          p_message_type: "followup",
          p_status: "blocked",
          p_error_message: "Follow-up not sent — subscription is not active.",
        });
        skipped++;
        continue;
      }
    }

    // Fail-safe: paused state blocks sends
    const { data: state } = await supabaseAdmin.rpc("get_company_sending_state", {
      p_company_id: companyId,
    });
    const paused = Array.isArray(state) ? state[0]?.paused : (state as any)?.paused;
    if (paused) {
      await supabaseAdmin.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: (est as any).id,
        p_message_type: "followup",
        p_status: "blocked",
        p_error_message:
          "Follow-up not sent — sending paused due to delivery issue. Manual resume required.",
      });
      skipped++;
      continue;
    }

    // CRITICAL: idempotency (estimate_id + followup + step)
    const sendIdempotencyKey = computeSendIdempotencyKey({
      relatedId: String((est as any).id),
      messageType: "followup",
      stepNumber: step,
    });
    const { data: claimed } = await supabaseAdmin.rpc("try_claim_send_idempotency", {
      p_company_id: companyId,
      p_send_idempotency_key: sendIdempotencyKey,
      p_related_id: (est as any).id,
      p_message_type: "followup",
      p_step_number: step,
    });

    if (!claimed) {
      await supabaseAdmin.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: (est as any).id,
        p_message_type: "followup",
        p_status: "duplicate_prevented",
        p_error_message: null,
      });
      skipped++;
      continue;
    }

    // LOCKED RULE: company not rate-limited (if limited, defer by 15m)
    const { data: rateLimited } = await supabaseAdmin.rpc("is_company_rate_limited", {
      p_company_id: companyId,
    });
    if (rateLimited === true) {
      await supabaseAdmin
        .from("estimates")
        .update({ next_followup_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
        .eq("id", (est as any).id);

      await supabaseAdmin.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: (est as any).id,
        p_message_type: "followup",
        p_status: "blocked",
        p_error_message: "Follow-up queued — messages are queued to protect deliverability.",
      });

      skipped++;
      continue;
    }

    // Authority Loop v1: enrich signature with contractor_profile (best-effort)
    let serviceArea: string | null = null;
    try {
      const wsId = (est as any).company?.workspace_id || null;
      if (wsId) {
        const { data } = await supabaseAdmin
          .from("contractor_profile")
          .select("service_area")
          .eq("workspace_id", wsId)
          .maybeSingle();
        serviceArea = (data as any)?.service_area ?? null;
      }
    } catch {
      serviceArea = null;
    }

    // Block 268600: include deterministic token so inbound reply can pause follow-ups instantly
    const subject = `Quick check-in on your roofing estimate [EST|${String((est as any).id)}]`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.45;">
        <p style="margin:0 0 12px;">${messageText.replace(/\n/g, "<br/>")}</p>
        ${renderAuthorityEmailSignature({ companyName, serviceArea })}
      </div>
    `;

    try {
      const fromEmail =
        process.env.RESEND_FROM || process.env.FROM_EMAIL || "no-reply@smartsend.ai";
      await sendHtmlEmail({ to: emailCheck.email, subject, html, fromName: companyName, fromEmail });
    } catch (sendErr) {
      console.error("Estimate followups cron: send failed", sendErr);

      const errMsg = (sendErr as any)?.message || String(sendErr);
      await supabaseAdmin.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: (est as any).id,
        p_message_type: "followup",
        p_status: "failed",
        p_error_message: `Follow-up not sent — delivery provider error: ${errMsg}`,
      });
      await supabaseAdmin.rpc("maybe_auto_pause_company", { p_company_id: companyId });
      await supabaseAdmin.rpc("pause_company_sending", {
        p_company_id: companyId,
        p_reason: "provider_failure",
        p_error:
          "Sending paused due to delivery issue. We’re protecting your account. Manual resume required.",
      });

      skipped++;
      continue;
    }

    const sentAt = new Date().toISOString();

    await supabaseAdmin.from("followups").insert({
      estimate_id: (est as any).id,
      step_number: step,
      message_text: messageText,
      sent_at: sentAt,
      delivery_method: "email",
    });

    const nextStep = step + 1;
    const nextDue = computeNextDue((est as any).sent_at || sentAt, nextStep);

    await supabaseAdmin
      .from("estimates")
      .update({
        last_followup_at: sentAt,
        next_followup_at: step >= 3 ? null : nextDue,
        followup_status: step >= 3 ? "stale" : "active",
      })
      .eq("id", (est as any).id);

    await supabaseAdmin.rpc("log_delivery_attempt", {
      p_company_id: companyId,
      p_related_id: (est as any).id,
      p_message_type: "followup",
      p_status: "sent",
      p_error_message: null,
    });

    if (tier === "locked") {
      followupsSentTodayCache.set(companyId, (followupsSentTodayCache.get(companyId) ?? 0) + 1);
    }
    sent++;
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}

export async function GET(req: Request) {
  return NextResponse.json({
    status: "ok",
    message: "Estimate followups cron endpoint is running",
  });
}










