// app/api/leads/send-reply/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  contactId: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().min(1),
  threadId: z.string().uuid().optional(), // reply to existing thread if you have it
});

export async function POST(req: Request) {
  const supabase = createClient();

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { contactId, subject, body, threadId } = parsed.data;

  // 1) Get user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2) Resolve account & contact info
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, account_id, workspace_id, email, first_name, last_name, company")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      { ok: false, error: "Contact not found" },
      { status: 404 }
    );
  }

  const accountId = contact.account_id;
  const workspaceId = contact.workspace_id;

  // OPTIONAL: resolve default mailbox for this account/workspace
  // Try multiple mailbox table patterns
  let mailboxId: string | null = null;

  // Try mailboxes table with account_id
  if (accountId) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("id")
      .eq("account_id", accountId)
      .eq("enabled", true)
      .maybeSingle();

    if (mailbox) {
      mailboxId = mailbox.id;
    }
  }

  // Fallback: try mailboxes with user_id
  if (!mailboxId) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (mailbox) {
      mailboxId = mailbox.id;
    }
  }

  // Fallback: try mailboxes with workspace_id
  if (!mailboxId && workspaceId) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();

    if (mailbox) {
      mailboxId = mailbox.id;
    }
  }

  // If still no mailbox, try to find any active mailbox for the user
  if (!mailboxId) {
    const queries = [];
    if (user.id) {
      queries.push(`user_id.eq.${user.id}`);
    }
    if (accountId) {
      queries.push(`account_id.eq.${accountId}`);
    }
    if (queries.length > 0) {
      const { data: mailboxes } = await supabase
        .from("mailboxes")
        .select("id")
        .or(queries.join(","))
        .eq("is_active", true)
        .limit(1);

      if (mailboxes && mailboxes.length > 0) {
        mailboxId = mailboxes[0].id;
      }
    }
  }

  // 3) Insert into send_queue (most common pattern)
  // Try send_queue first
  const sendQueueData: any = {
    user_id: user.id,
    to_email: contact.email,
    subject,
    body_html: body,
    status: "pending",
    scheduled_at: new Date().toISOString(),
  };

  // Try both contact_id and lead_id (different schemas use different fields)
  // First try to find a lead that matches this contact's email
  if (contact.email) {
    const { data: matchingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", contact.email)
      .maybeSingle();

    if (matchingLead) {
      sendQueueData.lead_id = matchingLead.id;
    }
  }

  // Also include contact_id if schema supports it
  sendQueueData.contact_id = contact.id;

  if (accountId) {
    sendQueueData.account_id = accountId;
  }
  if (workspaceId) {
    sendQueueData.workspace_id = workspaceId;
  }
  if (mailboxId) {
    sendQueueData.mailbox_id = mailboxId;
  }
  if (threadId) {
    sendQueueData.thread_id = threadId;
  }

  const { error: insertError } = await supabase
    .from("send_queue")
    .insert(sendQueueData);

  // If send_queue insert failed, try outbound_queue as fallback
  if (insertError) {
    console.log("[send-reply] send_queue insert failed, trying outbound_queue", insertError);

    const outboundQueueData: any = {
      to_email: contact.email,
      subject,
      body: body,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    };

    if (accountId) {
      outboundQueueData.org_id = accountId;
    }
    if (workspaceId) {
      outboundQueueData.org_id = workspaceId;
    }

    const { error: outboundError } = await supabase
      .from("outbound_queue")
      .insert(outboundQueueData);

    if (outboundError) {
      console.error("[send-reply] both insert attempts failed", {
        sendQueueError: insertError,
        outboundQueueError: outboundError,
      });
      return NextResponse.json(
        { ok: false, error: "Failed to create email job" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

