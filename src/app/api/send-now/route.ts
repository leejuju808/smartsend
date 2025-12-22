import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET ?? "";

const Body = z.object({
  mode: z.enum(["last-draft", "explicit"]).default("last-draft"),
  thread_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  from_account_id: z.string().uuid().optional(),
  provider: z.enum(["gmail", "outlook", "sim"]).default("gmail"),
  step_no: z.number().int().min(1).default(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  // future: variant_id, task_id, etc.
});

type BodyT = z.infer<typeof Body>;

const supabase = createAdminClient();

async function sendViaGmail(opts: {
  connectedAccountId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}) {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL not configured");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/send_gmail`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-smartsend-sig": EDGE_SHARED_SECRET,
    },
    body: JSON.stringify({
      connected_account_id: opts.connectedAccountId,
      to: opts.to,
      from: opts.from,
      subject: opts.subject,
      body: opts.body,
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? `gmail edge send failed: ${res.statusText}`);
  }

  const j = await res.json();
  return {
    provider_message_id: j.id as string,
    provider_thread_id: (j.threadId ?? opts.threadId ?? null) as string | null,
  };
}

async function sendViaOutlook(_opts: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  throw new Error("Outlook sender not wired yet");
}

async function sendSim(_opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  return {
    provider_message_id: `sim_${randomUUID()}`,
    provider_thread_id: `simth_${randomUUID()}`,
  };
}

export async function POST(req: NextRequest) {
  let payload: BodyT;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    payload = parsed.data;
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const threadId = payload.thread_id;

  const { data: draft, error: draftErr } =
    payload.mode === "last-draft"
      ? await supabase
          .from("reply_drafts")
          .select("id, subject, body, created_at, kind")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

  if (draftErr) {
    return NextResponse.json({ error: draftErr.message }, { status: 500 });
  }

  if (payload.mode === "last-draft" && !draft) {
    return NextResponse.json({ error: "No draft found for thread" }, { status: 404 });
  }

  const [{ data: lead, error: leadErr }, { data: thread, error: threadErr }] =
    await Promise.all([
      supabase.from("leads").select("email").eq("id", payload.lead_id).maybeSingle(),
      supabase
        .from("inbox_threads")
        .select("account_id")
        .eq("id", threadId)
        .maybeSingle(),
    ]);

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  const toEmail = lead?.email as string | undefined;
  if (!toEmail) {
    return NextResponse.json({ error: "Lead has no email" }, { status: 400 });
  }

  const resolvedAccountId = payload.from_account_id ?? thread?.account_id;
  if (!resolvedAccountId) {
    return NextResponse.json(
      { error: "No from_account_id available for this thread" },
      { status: 400 }
    );
  }

  const { data: acct, error: acctErr } = await supabase
    .from("connected_accounts")
    .select("id, provider, access_token, email, expires_at, refresh_token")
    .eq("id", resolvedAccountId)
    .maybeSingle();

  if (acctErr) {
    return NextResponse.json({ error: acctErr.message }, { status: 500 });
  }

  if (!acct) {
    return NextResponse.json({ error: "Connected account not found" }, { status: 404 });
  }

  const fromEmail = acct.email as string | undefined;
  if (!fromEmail) {
    return NextResponse.json({ error: "Connected account missing email" }, { status: 400 });
  }

  const subject =
    payload.mode === "last-draft"
      ? draft?.subject ?? ""
      : payload.subject ?? "";
  const body =
    payload.mode === "last-draft"
      ? draft?.body ?? ""
      : payload.body ?? "";

  if (payload.mode === "explicit" && (!payload.subject || !payload.body)) {
    return NextResponse.json(
      { error: "subject and body required for explicit mode" },
      { status: 400 }
    );
  }

  let provider_message_id: string | null = null;
  let provider_thread_id: string | null = null;

  try {
    if (payload.provider === "gmail") {
      const res = await sendViaGmail({
        connectedAccountId: acct.id as string,
        from: fromEmail,
        to: toEmail,
        subject: subject ?? "",
        body: body ?? "",
        threadId: threadId,
      });
      provider_message_id = res.provider_message_id;
      provider_thread_id = res.provider_thread_id;
    } else if (payload.provider === "outlook") {
      if (!acct.access_token) {
        throw new Error("Connected account missing access token");
      }
      const res = await sendViaOutlook({
        accessToken: acct.access_token,
        from: fromEmail,
        to: toEmail,
        subject: subject ?? "",
        body: body ?? "",
      });
      provider_message_id = res.provider_message_id;
      provider_thread_id = res.provider_thread_id;
    } else {
      const res = await sendSim({
        from: fromEmail,
        to: toEmail,
        subject: subject ?? "",
        body: body ?? "",
      });
      provider_message_id = res.provider_message_id;
      provider_thread_id = res.provider_thread_id;
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "send failed" },
      { status: 502 }
    );
  }

  const subjectSnapshot = subject ?? "";
  const { error: txErr } = await supabase.rpc("send_now_finalize", {
    p_thread_id: payload.thread_id,
    p_campaign_id: payload.campaign_id,
    p_lead_id: payload.lead_id,
    p_step_no: payload.step_no,
    p_provider: payload.provider,
    p_provider_message_id: provider_message_id,
    p_provider_thread_id: provider_thread_id,
    p_to_email: toEmail,
    p_subject_snapshot: subjectSnapshot,
  });

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    provider_message_id,
    provider_thread_id,
  });
}


