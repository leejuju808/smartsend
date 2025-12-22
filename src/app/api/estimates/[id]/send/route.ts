// Block 267100 — Send Estimate to Homeowner (v1 simple transactional email)
// POST /api/estimates/[id]/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

function formatMoney(value: any) {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function renderAuthorityEstimateFooter(opts: { companyName: string; serviceArea?: string | null }) {
  const companyName = opts.companyName;
  const serviceArea = (opts.serviceArea || "").trim() || "your area";
  return `
    <div style="margin-top:18px;border-top:1px solid #eee;padding-top:14px;">
      <div style="font-weight:700;margin:0 0 8px;color:#111;">
        Why Homeowners Choose ${escapeHtml(companyName)}
      </div>
      <ul style="margin:0;padding-left:18px;color:#374151;">
        <li style="margin:4px 0;">Local roofing professionals serving ${escapeHtml(serviceArea)}</li>
        <li style="margin:4px 0;">Clear pricing, no surprises</li>
        <li style="margin:4px 0;">Workmanship-backed warranty</li>
        <li style="margin:4px 0;">Fast scheduling and clean job sites</li>
      </ul>
    </div>
  `;
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

function renderEstimateHtml(opts: {
  companyName: string;
  homeownerName?: string | null;
  serviceArea?: string | null;
  lineItems: any[];
  subtotal: any;
  tax: any;
  total: any;
  notes?: string | null;
}) {
  const { companyName, homeownerName, serviceArea, lineItems, subtotal, tax, total, notes } = opts;

  const rows = (Array.isArray(lineItems) ? lineItems : []).map((li, idx) => {
    const material = escapeHtml(String(li.material ?? li.description ?? `Item ${idx + 1}`));
    const qty = escapeHtml(String(li.quantity ?? ""));
    const unit = li.unit_price != null ? escapeHtml(formatMoney(li.unit_price)) : "";
    const rowTotal = escapeHtml(formatMoney(li.total ?? 0));
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${material}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${unit}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${rowTotal}</td>
      </tr>
    `;
  }).join("");

  const safeNotes = notes ? `<p style="margin:12px 0 0;color:#444;"><strong>Notes:</strong><br/>${escapeHtml(String(notes))}</p>` : "";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.4;">
      <h2 style="margin:0 0 8px;">Your Roofing Estimate from ${escapeHtml(companyName)}</h2>
      <p style="margin:0 0 16px;color:#444;">
        ${homeownerName ? `Hi ${escapeHtml(homeownerName)},` : "Hi,"}
        <br/>
        Here’s your estimate. Reply <strong>YES</strong> to approve or ask any questions.
        <br/>
        <strong>Next step is scheduling once approved.</strong>
      </p>

      <div style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:10px;text-align:left;border-bottom:1px solid #eee;">Item</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #eee;">Qty</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #eee;">Unit</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #eee;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="4" style="padding:12px;color:#666;">(No line items)</td></tr>`}
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px;display:flex;justify-content:flex-end;">
        <table style="border-collapse:collapse;">
          <tr><td style="padding:4px 10px;color:#555;">Subtotal</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatMoney(subtotal))}</td></tr>
          <tr><td style="padding:4px 10px;color:#555;">Tax</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatMoney(tax))}</td></tr>
          <tr><td style="padding:6px 10px;color:#111;font-size:16px;"><strong>Total</strong></td><td style="padding:6px 0;text-align:right;font-size:16px;"><strong>${escapeHtml(formatMoney(total))}</strong></td></tr>
        </table>
      </div>

      ${safeNotes}

      ${renderAuthorityEstimateFooter({ companyName, serviceArea })}
      ${renderAuthorityEmailSignature({ companyName, serviceArea })}
    </div>
  `;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const toEmailRaw = String(body?.to_email || body?.sent_to_email || "").trim();
    const emailCheck = assertValidRecipientEmail(toEmailRaw);
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: "Estimate not sent — email address is invalid." },
        { status: 400 }
      );
    }

    // Load estimate with company + homeowner
    const { data: estimate, error } = await supabase
      .from("estimates")
      .select(
        `
        *,
        company:roofing_companies(*),
        homeowner:homeowners(*)
      `
      )
      .eq("id", id)
      .single();

    if (error || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    if (estimate.company?.owner_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const companyId = String(estimate.company_id || estimate.company?.id || "");
    if (!companyId) {
      return NextResponse.json(
        { error: "Estimate not sent — missing company." },
        { status: 400 }
      );
    }

    // BLOCK 289000 — Monetization Lock (hard gate)
    // Check before sending so we never deliver an email we can't record/allow.
    const { data: limitRows, error: limitErr } = await supabase.rpc("ss_check_and_bump_usage", {
      p_company_id: companyId,
      p_action: "send_estimate",
      p_amount: 1,
      p_bump: false,
    });
    const limitRow = Array.isArray(limitRows) ? limitRows[0] : (limitRows as any);
    if (limitErr || !limitRow) {
      return NextResponse.json(
        { error: limitErr?.message || "Unable to verify plan limits." },
        { status: 500 }
      );
    }
    if (!limitRow.allowed) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "blocked",
        p_error_message: "You’ve hit your plan limit. Upgrade to keep momentum.",
      });
      return NextResponse.json(
        {
          error: "You’ve hit your plan limit. Upgrade to keep momentum.",
          code: "PLAN_LIMIT",
          reason: limitRow.reason,
          plan: limitRow.plan,
          subscription_status: limitRow.status,
          currentCount: limitRow.current_count,
          maxAllowed: limitRow.max_allowed,
        },
        { status: 402 }
      );
    }

    // LOCKED RULE: delivery_status != already_sent
    const alreadySent =
      String((estimate as any).delivery_status || "") === "sent" ||
      String((estimate as any).status || "") === "sent" ||
      !!(estimate as any).sent_at;

    // CRITICAL: idempotency claim before sending (prevents double send)
    const sendIdempotencyKey = computeSendIdempotencyKey({
      relatedId: id,
      messageType: "estimate",
      stepNumber: 0,
    });

    const { data: claimed, error: claimErr } = await supabase.rpc(
      "try_claim_send_idempotency",
      {
        p_company_id: companyId,
        p_send_idempotency_key: sendIdempotencyKey,
        p_related_id: id,
        p_message_type: "estimate",
        p_step_number: 0,
      }
    );

    if (claimErr) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "failed",
        p_error_message: `Estimate not sent — internal idempotency error: ${claimErr.message}`,
      });
      await supabase.rpc("pause_company_sending", {
        p_company_id: companyId,
        p_reason: "provider_failure",
        p_error: "Sending paused due to delivery issue. Manual resume required.",
      });
      return NextResponse.json(
        {
          error:
            "Estimate not sent — sending paused due to a delivery issue. We’re protecting your account.",
          code: "SENDING_PAUSED",
        },
        { status: 503 }
      );
    }

    if (!claimed) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "duplicate_prevented",
        p_error_message: null,
      });
      return NextResponse.json({ ok: true, duplicate_prevented: true });
    }

    if (alreadySent) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "duplicate_prevented",
        p_error_message: "Estimate already sent.",
      });
      return NextResponse.json(
        { error: "Estimate not sent — it was already sent." },
        { status: 409 }
      );
    }

    // Fail-safe: if company sending is paused, block.
    const { data: state } = await supabase.rpc("get_company_sending_state", {
      p_company_id: companyId,
    });
    const paused = Array.isArray(state) ? state[0]?.paused : (state as any)?.paused;
    if (paused) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "blocked",
        p_error_message:
          "Estimate not sent — sending is paused due to a delivery issue. Manual resume required.",
      });
      return NextResponse.json(
        {
          error:
            "Estimate not sent — sending paused due to delivery issue. We’re protecting your account.",
          code: "SENDING_PAUSED",
        },
        { status: 423 }
      );
    }

    // LOCKED RULE: company not rate-limited
    const { data: rateLimited } = await supabase.rpc("is_company_rate_limited", {
      p_company_id: companyId,
    });
    if (rateLimited === true) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "blocked",
        p_error_message: "Estimate queued — messages are queued to protect deliverability.",
      });
      return NextResponse.json(
        {
          error: "Estimate queued — messages are queued to protect deliverability.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    // Authority Loop v1: prefer contractor_profile for canonical company_name / service_area
    let profile: { company_name: string | null; service_area: string | null } | null = null;
    try {
      if (estimate.company?.workspace_id) {
        const { data } = await supabase
          .from("contractor_profile")
          .select("company_name, service_area")
          .eq("workspace_id", estimate.company.workspace_id)
          .maybeSingle();
        profile = data ?? null;
      }
    } catch {
      profile = null;
    }

    const companyName = profile?.company_name || estimate.company?.name || "SmartSend";
    const serviceArea = profile?.service_area || null;
    const homeownerName = estimate.homeowner?.name || null;
    const html = renderEstimateHtml({
      companyName,
      homeownerName,
      serviceArea,
      lineItems: estimate.line_items || [],
      subtotal: estimate.subtotal ?? 0,
      tax: estimate.tax ?? 0,
      total: estimate.total ?? 0,
      notes: estimate.notes ?? null,
    });

    // Block 268600: Deterministic reply → estimate mapping (for auto-stop on response)
    // NOTE: Inbound email webhook will parse [EST|<estimateId>] and pause follow-ups instantly.
    const subject = `Your Roofing Estimate from ${companyName} [EST|${id}]`;
    const fromEmail =
      process.env.RESEND_FROM ||
      process.env.FROM_EMAIL ||
      "no-reply@smartsend.ai";

    try {
      await sendHtmlEmail({
        to: emailCheck.email,
        subject,
        html,
        fromName: companyName,
        fromEmail,
      });
    } catch (emailErr) {
      const errMsg = (emailErr as any)?.message || String(emailErr);
      console.error("Estimate email send failed:", emailErr);

      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: "failed",
        p_error_message: `Estimate not sent — delivery provider error: ${errMsg}`,
      });

      // Auto-protection: pause after repeated failures
      await supabase.rpc("maybe_auto_pause_company", { p_company_id: companyId });

      // Immediate fail-safe: pause sending on provider failure (manual resume)
      await supabase.rpc("pause_company_sending", {
        p_company_id: companyId,
        p_reason: "provider_failure",
        p_error:
          "Sending paused due to delivery issue. We’re protecting your account. Manual resume required.",
      });

      return NextResponse.json(
        {
          error:
            "Estimate not sent — sending paused due to delivery issue. We’re protecting your account.",
          code: "SENDING_PAUSED",
        },
        { status: 503 }
      );
    }

    // Update estimate + log event
    const nowIso = new Date().toISOString();
    const day2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateErr } = await supabase
      .from("estimates")
      .update({
        sent_at: nowIso,
        sent_to_email: emailCheck.email,
        delivery_status: "sent",
        status: "sent",
        // Block 269100 — Reality Anchor: job origin tag (set once; DB trigger prevents removal)
        origin_source: "smartsend",
        // Block 269000 — canonical follow-up scheduling (no config)
        followup_status: "active",
        last_followup_at: null,
        next_followup_at: day2,
      })
      .eq("id", id);
    if (updateErr) {
      const msg = updateErr.message || "Failed to update estimate state.";
      const isPlanLimit = msg.includes("SS_PLAN_LIMIT");
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: id,
        p_message_type: "estimate",
        p_status: isPlanLimit ? "blocked" : "failed",
        p_error_message: msg,
      });
      return NextResponse.json(
        {
          error: isPlanLimit ? "You’ve hit your plan limit. Upgrade to keep momentum." : msg,
          code: isPlanLimit ? "PLAN_LIMIT" : "UPDATE_FAILED",
        },
        { status: isPlanLimit ? 402 : 500 }
      );
    }

    await supabase.from("estimate_events").insert({
      estimate_id: id,
      event_type: "sent",
    });

    await supabase.rpc("log_delivery_attempt", {
      p_company_id: companyId,
      p_related_id: id,
      p_message_type: "estimate",
      p_status: "sent",
      p_error_message: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error in /api/estimates/[id]/send:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}










