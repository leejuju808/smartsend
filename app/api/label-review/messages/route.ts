import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { stripHtml } from "@/lib/template";

type MessageRow = {
  id: string;
  thread_id: string;
  snippet?: string | null;
  body_text?: string | null;
  body_plain?: string | null;
  body_html?: string | null;
  subject?: string | null;
  direction?: string | null;
  created_at?: string | null;
};

const toSnippet = (row: MessageRow) => {
  if (!row) return "";
  if (row.snippet && row.snippet.trim()) return row.snippet.trim();
  if (row.body_text && row.body_text.trim()) return row.body_text.trim();
  if (row.body_plain && row.body_plain.trim()) return row.body_plain.trim();
  if (row.body_html && row.body_html.trim()) return stripHtml(row.body_html);
  return "";
};

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null);
    const messageIds = Array.isArray(payload?.message_ids) ? payload.message_ids : [];

    if (!messageIds.length) {
      return NextResponse.json({ items: {} });
    }

    const ids = Array.from(
      new Set(
        messageIds
          .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
          .slice(0, 50),
      ),
    );

    if (!ids.length) {
      return NextResponse.json({ items: {} });
    }

    const { data: inboxRows, error: inboxErr } = await supabaseAdmin
      .from("inbox_messages")
      .select(
        "id, thread_id, snippet, body_text, body_plain, body_html, subject, direction, created_at",
      )
      .in("id", ids);

    if (inboxErr) {
      console.error("label-review/messages inbox query failed", inboxErr);
    }

    const foundIds = new Set((inboxRows ?? []).map((row) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    let fallbackRows: MessageRow[] = [];

    if (missing.length) {
      const { data: fallback, error: fallbackErr } = await supabaseAdmin
        .from("messages")
        .select("id, thread_id, body_text, body_html, subject, direction, created_at")
        .in("id", missing);

      if (fallbackErr) {
        console.error("label-review/messages fallback query failed", fallbackErr);
      }

      fallbackRows = (fallback ?? []) as MessageRow[];
    }

    const result: Record<
      string,
      {
        thread_id: string | null;
        subject: string | null;
        snippet: string;
        direction: string | null;
        created_at: string | null;
      }
    > = {};
    for (const row of [...(inboxRows ?? []), ...fallbackRows]) {
      result[row.id] = {
        thread_id: row.thread_id ?? null,
        subject: row.subject ?? null,
        snippet: toSnippet(row).slice(0, 240),
        direction: row.direction ?? null,
        created_at: row.created_at ?? null,
      };
    }

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error("label-review/messages failed", error);
    return NextResponse.json({ error: "label-review/messages failed" }, { status: 500 });
  }
}

