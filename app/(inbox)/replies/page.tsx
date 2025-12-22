import RepliesClient from "./RepliesClient";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReplyRow = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  snippet: string | null;
  text_body: string | null;
  html_body: string | null;
  headers: Record<string, unknown>;
  received_at: string;
  lead_id: string | null;
  campaign_id: string | null;
  lead: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
  } | null;
  reply_classifications: {
    label: string;
    confidence: number;
  } | null;
  tone_label?: string | null;
};

export default async function RepliesPage() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("inbound_messages")
    .select(
      `
        id,
        from_email,
        to_email,
        subject,
        snippet,
        text_body,
        html_body,
        headers,
        received_at,
        lead_id,
        campaign_id,
        lead:leads(id, full_name, first_name, last_name, email),
        campaign:campaigns(id, name),
        reply_classifications(label, confidence)
      `
    )
    .order("received_at", { ascending: false })
    .limit(200);

  const { data: hotView } = await supabase
    .from("saved_views")
    .select("id")
    .eq("account_id", "00000000-0000-0000-0000-000000000001")
    .eq("scope", "inbox")
    .eq("name", "Hot Leads — last 7d + score ≥ 60")
    .maybeSingle();

  if (error) {
    console.error("Failed to load inbound messages", error);
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load replies inbox. Please refresh.
      </div>
    );
  }

  const rows: ReplyRow[] = (data ?? []).map((row: any) => ({
    ...row,
    headers: row.headers ?? {},
    reply_classifications: Array.isArray(row.reply_classifications)
      ? row.reply_classifications[0] ?? null
      : row.reply_classifications,
  }));

  const replyIds = rows.map((row) => row.id).filter(Boolean);
  let toneByReply = new Map<string, string | null>();

  if (replyIds.length > 0) {
    const { data: tones } = await supabase
      .from("reply_training_labels")
      .select("reply_id, tone")
      .in("reply_id", replyIds);

    if (Array.isArray(tones)) {
      toneByReply = new Map<string, string | null>(
        tones
          .filter((r: any) => typeof r?.reply_id === "string")
          .map((r: any) => [r.reply_id as string, (r.tone as string | null) ?? null]),
      );
    }
  }

  const rowsWithTone = rows.map((row) => ({
    ...row,
    tone_label: toneByReply.get(row.id) ?? null,
  }));

  return <RepliesClient rows={rowsWithTone} hotLeadsViewId={hotView?.id ?? null} />;
}

