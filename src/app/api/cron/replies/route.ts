import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { fetchRecentInboundWithBody } from "@/server/gmail";

function auth(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

async function ownersToCheck() {
  const { data } = await supabaseAdmin
    .from("mailboxes")
    .select("owner,provider,verified,last_reply_check_at")
    .eq("verified", true);
  return (data || []).map((r: any) => r.owner as string);
}

function extractThreadIds(h: Record<string, string>) {
  const refs = (h["References"] || "").match(/<[^>]+>/g) || [];
  const inrep = (h["In-Reply-To"] || "").match(/<[^>]+>/g) || [];
  return Array.from(new Set([...(refs as string[]), ...(inrep as string[])]));
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owners = await ownersToCheck();
  let totalReplies = 0;

  for (const owner of owners) {
    try {
      const inbound = await fetchRecentInboundWithBody(owner);
      for (const m of inbound) {
        const threadIds = extractThreadIds(m.headers as any);
        if (!threadIds.length) continue;

        const { data: sent, error: sentErr } = await supabaseAdmin
          .from("outbound_messages")
          .select("id, owner, lead_id, sequence_id")
          .eq("owner", owner)
          .in("message_id", threadIds);
        if (sentErr) continue;
        if (!sent?.length) continue;

        for (const s of sent) {
          await supabaseAdmin
            .from("outbound_messages")
            .update({
              replied: true,
              reply_gmail_id: m.id,
              reply_received_at: new Date().toISOString(),
            })
            .eq("id", (s as any).id);

          await supabaseAdmin
            .from("leads")
            .update({ last_replied_at: new Date().toISOString() })
            .eq("id", (s as any).lead_id)
            .eq("owner", owner);

          const { data: seq } = await supabaseAdmin
            .from("sequences")
            .select("stop_on_reply")
            .eq("id", (s as any).sequence_id)
            .maybeSingle();

          if (seq?.stop_on_reply) {
            await supabaseAdmin
              .from("enrollments")
              .update({ status: "completed", next_send_at: null })
              .eq("owner", owner)
              .eq("lead_id", (s as any).lead_id)
              .eq("sequence_id", (s as any).sequence_id)
              .eq("status", "active");
          }

          await supabaseAdmin
            .from("send_events")
            .insert({ owner, lead_id: (s as any).lead_id, sequence_id: (s as any).sequence_id, kind: "replied" })
            .catch(() => {});

          // Inbox ingestion
          // Lookup workspace from lead or membership
          let workspaceId: string | null = null;
          try {
            const { data: mem } = await supabaseAdmin
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", owner)
              .limit(1)
              .maybeSingle();
            workspaceId = (mem as any)?.workspace_id || null;
          } catch {}
          // Find contact by from email
          const fromEmail = String((m.headers as any)["From"] || "").replace(/^.*<([^>]+)>.*$/i, "$1").trim();
          let contactId: string | null = null;
          if (fromEmail && workspaceId) {
            const { data: c } = await supabaseAdmin
              .from("contacts")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("email", fromEmail)
              .maybeSingle();
            contactId = (c as any)?.id || null;
          }
          const subject = String((m.headers as any)["Subject"] || "").slice(0, 500);
          if (workspaceId) {
            const { data: threadRow } = await supabaseAdmin
              .from("inbox_threads")
              .upsert({
                workspace_id: workspaceId,
                contact_id: contactId,
                subject,
                last_message_at: new Date().toISOString(),
              } as any, { onConflict: "workspace_id,contact_id,subject" })
              .select("id")
              .maybeSingle();
            const threadId = (threadRow as any)?.id;
            if (threadId) {
              await supabaseAdmin
                .from("inbox_messages")
                .insert({
                  thread_id: threadId,
                  sender: fromEmail || "unknown",
                  body: m.bodyText || "",
                  sent_at: new Date().toISOString(),
                  is_incoming: true,
                });
              await supabaseAdmin
                .from("inbox_threads")
                .update({ last_message_at: new Date().toISOString(), status: "open" })
                .eq("id", threadId);
            }
          }

          totalReplies++;
        }
      }

      await supabaseAdmin
        .from("mailboxes")
        .update({ last_reply_check_at: new Date().toISOString() })
        .eq("owner", owner);
    } catch (e) {
      console.error("Reply cron error", owner, e);
    }
  }

  return NextResponse.json({ ok: true, owners: owners.length, replies: totalReplies });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { fetchRecentInbound } from "@/server/gmail";

function auth(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

async function ownersToCheck() {
  const { data } = await supabaseAdmin
    .from("mailboxes")
    .select("owner,provider,verified,last_reply_check_at")
    .eq("verified", true);
  return (data || []).map((r: any) => r.owner as string);
}

function extractThreadIds(h: Record<string, string>) {
  const refs = (h["References"] || "").match(/<[^>]+>/g) || [];
  const inrep = (h["In-Reply-To"] || "").match(/<[^>]+>/g) || [];
  return Array.from(new Set([...refs, ...inrep]));
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owners = await ownersToCheck();
  let totalReplies = 0;

  for (const owner of owners) {
    try {
      const inbound = await fetchRecentInbound(owner);
      for (const m of inbound) {
        const threadIds = extractThreadIds(m.headers);
        if (!threadIds.length) continue;

        const { data: sent } = await supabaseAdmin
          .from("outbound_messages")
          .select("id, owner, lead_id, sequence_id")
          .eq("owner", owner)
          .in("message_id", threadIds);

        if (!sent?.length) continue;

        for (const s of sent) {
          await supabaseAdmin
            .from("outbound_messages")
            .update({
              replied: true,
              reply_gmail_id: m.id,
              reply_received_at: new Date().toISOString(),
            })
            .eq("id", s.id);

          await supabaseAdmin
            .from("leads")
            .update({ last_replied_at: new Date().toISOString() })
            .eq("id", s.lead_id);

          const { data: seq } = await supabaseAdmin
            .from("sequences")
            .select("stop_on_reply")
            .eq("id", s.sequence_id)
            .single();

          if (seq?.stop_on_reply) {
            await supabaseAdmin
              .from("enrollments")
              .update({ status: "completed", next_send_at: null })
              .eq("owner", owner)
              .eq("lead_id", s.lead_id)
              .eq("sequence_id", s.sequence_id)
              .eq("status", "active");
          }

          await supabaseAdmin
            .from("send_events")
            .insert({ owner, lead_id: s.lead_id, sequence_id: s.sequence_id, kind: "replied" })
            .catch(() => {});

          totalReplies++;
        }
      }

      await supabaseAdmin
        .from("mailboxes")
        .update({ last_reply_check_at: new Date().toISOString() })
        .eq("owner", owner);
    } catch (e) {
      console.error("Reply cron error", owner, e);
    }
  }

  return NextResponse.json({ ok: true, owners: owners.length, replies: totalReplies });
}

