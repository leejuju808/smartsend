import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { runPreflight } from "@/lib/content/preflight";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const Body = z.object({
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
  draft_id: z.string().uuid().optional(),
  source_message_id: z.string().uuid().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const json = await req.json().catch(() => ({}));
  const p = Body.parse(json);

  const { data: thr, error: terr } = await sb
    .from("inbox_threads")
    .select("id,campaign_id,lead_id")
    .eq("id", params.threadId)
    .maybeSingle();
  if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });
  if (!thr || thr.campaign_id !== p.campaign_id || thr.lead_id !== p.lead_id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: campaign, error: cerr } = await sb
    .from("campaigns")
    .select("account_id")
    .eq("id", p.campaign_id)
    .maybeSingle();
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });

  const { data: lead, error: lerr } = await sb
    .from("leads")
    .select("email, workspace_id")
    .eq("id", p.lead_id)
    .maybeSingle();
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 500 });
  if (!lead?.email)
    return NextResponse.json({ error: "missing_lead_email" }, { status: 400 });

  // Block 12600: Check if contact is suppressed
  if (lead.workspace_id) {
    const { data: isSuppressed } = await sb.rpc("is_suppressed", {
      p_workspace_id: lead.workspace_id,
      p_email: lead.email,
    });

    if (isSuppressed) {
      const { data: reason } = await sb.rpc("get_suppression_reason", {
        p_workspace_id: lead.workspace_id,
        p_email: lead.email,
      });

      return NextResponse.json(
        {
          error: "suppressed",
          message: `This contact is suppressed (${reason || "unknown reason"}). You cannot email them.`,
          reason: reason || "unknown",
        },
        { status: 403 }
      );
    }
  }

  const fallbackAccountId =
    process.env.MANUAL_SEND_ACCOUNT_ID ??
    process.env.DEFAULT_SEND_ACCOUNT_ID ??
    null;
  const accountId = campaign?.account_id ?? fallbackAccountId;
  if (!accountId) {
    return NextResponse.json({ error: "missing_account" }, { status: 400 });
  }

  let provider: "gmail" | "outlook" = "gmail";
  let fromEmail = "";
  const { data: mailAccount, error: mailErr } = await sb
    .from("mail_accounts")
    .select("id,email,provider")
    .eq("id", accountId)
    .maybeSingle();
  if (mailErr && mailErr.code !== "42P01") {
    return NextResponse.json({ error: mailErr.message }, { status: 500 });
  }
  if (mailAccount?.id) {
    provider = (mailAccount.provider ?? provider) as "gmail" | "outlook";
    fromEmail = mailAccount.email ?? "";
  } else if (!fallbackAccountId || accountId !== fallbackAccountId) {
    return NextResponse.json({ error: "missing_account" }, { status: 400 });
  } else if (process.env.MANUAL_SEND_PROVIDER) {
    provider = process.env.MANUAL_SEND_PROVIDER === "outlook" ? "outlook" : "gmail";
  }

  if (!fromEmail && fallbackAccountId && accountId === fallbackAccountId) {
    const fallbackFrom =
      process.env.MANUAL_SEND_FROM_EMAIL ?? process.env.DEFAULT_FROM_EMAIL ?? null;
    if (fallbackFrom) {
      fromEmail = fallbackFrom;
    }
  }

  if (!fromEmail) {
    return NextResponse.json({ error: "missing_from_email" }, { status: 400 });
  }

  // Brand-aware preflight check
  try {
    const brandPreflight = await runPreflight({
      campaignId: p.campaign_id,
      contactId: p.lead_id,
      subject: p.subject ?? "",
      body: p.body,
    });

    if (!brandPreflight.ok) {
      const blockingIssues = brandPreflight.issues.filter(
        (i) =>
          i.code === "MISSING_TAG" ||
          i.code === "SUBJECT_TOO_LONG" ||
          i.code === "BODY_TOO_LONG" ||
          i.code === "LINKS_BLOCKED" ||
          i.code === "FORBIDDEN_PHRASE",
      );

      if (blockingIssues.length > 0) {
        return NextResponse.json(
          {
            error: "preflight_fail",
            message: `Preflight failed — fix issues before sending: ${blockingIssues.map((i) => i.code).join(", ")}`,
            issues: brandPreflight.issues,
          },
          { status: 400 },
        );
      }
    }
  } catch (preflightError) {
    // Log but don't block if preflight service fails
    console.error("Brand preflight check failed:", preflightError);
  }

  const preflightPayload = {
    account_id: accountId,
    message_id: null,
    from_email: fromEmail,
    to_email: lead.email,
    subject: p.subject ?? "",
    text: p.body,
  };

  const preflightRes = await fetch(`${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/preflight-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    },
    body: JSON.stringify(preflightPayload),
  });
  const preflightJson = await preflightRes.json().catch(() => ({}));

  if (!preflightRes.ok) {
    const message = preflightJson?.error ?? "preflight_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (preflightJson?.severity === "fail") {
    const failing =
      preflightJson?.failing ??
      (Array.isArray(preflightJson?.checks)
        ? preflightJson.checks.filter((c: any) => !c?.ok).map((c: any) => c?.key).filter(Boolean)
        : []);
    return NextResponse.json(
      {
        error: "preflight_fail",
        message: `Preflight failed — fix issues before sending${failing.length ? ` (${failing.join(", ")})` : ""}`,
        failing,
      },
      { status: 400 }
    );
  }


  let sourceMessageId = p.source_message_id ?? null;

  if (!sourceMessageId && p.draft_id) {
    const { data: draft } = await sb
      .from("inbox_drafts")
      .select("id,source_message_id")
      .eq("id", p.draft_id)
      .maybeSingle();
    if (draft?.source_message_id) {
      sourceMessageId = draft.source_message_id;
    }
  }

  if (!sourceMessageId) {
    const { data: inbound } = await sb
      .from("normalized_messages")
      .select("id")
      .eq("linked_thread_id", params.threadId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inbound?.id) {
      sourceMessageId = inbound.id;
    }
  }

  // Get authenticated user ID for sent_by_user_id tracking
  let sentByUserId: string | null = null;
  try {
    const authSupabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await authSupabase.auth.getUser();
    sentByUserId = user?.id ?? null;
  } catch (authError) {
    // If auth fails, continue without sent_by_user_id (for service-to-service calls)
    console.warn("Could not get authenticated user for sent_by_user_id:", authError);
  }

  const queuedAt = new Date().toISOString();
  const { error: qerr } = await sb.from("send_queue").insert({
    campaign_id: p.campaign_id,
    lead_id: p.lead_id,
    thread_id: params.threadId,
    source_message_id: sourceMessageId,
    provider,
    account_id: accountId,
    subject: p.subject ?? null,
    body: p.body,
    headers: { to: lead.email },
    priority: 5,
    queued_at: queuedAt,
    status: "queued",
    source: "manual_reply",
    sent_by_user_id: sentByUserId,
  });
  if (qerr) return NextResponse.json({ error: qerr.message }, { status: 500 });

  if (p.draft_id) {
    await sb.from("inbox_drafts").delete().eq("id", p.draft_id);
  }

  await sb
    .from("inbox_threads")
    .update({ needs_reply: false, replied_at: new Date().toISOString() })
    .eq("id", params.threadId);

  // Block 21744: Mark first contact if needed (manual email reply)
  try {
    await sb.rpc("mark_first_contact_if_needed", {
      p_lead_id: p.lead_id,
    });
  } catch (contactErr) {
    // Don't fail the request if marking contact fails
    console.error("Failed to mark first contact:", contactErr);
  }

  return NextResponse.json({ ok: true });
}