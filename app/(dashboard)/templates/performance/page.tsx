// app/(dashboard)/templates/performance/page.tsx

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { TemplatesPerformanceTable } from "./_components/templates-performance-table";

export const dynamic = "force-dynamic";

export default async function TemplatesPerformancePage() {
  const supabase = createServerComponentClient({ cookies });

  const { data: stats } = await supabase
    .from("template_performance_stats")
    .select("*")
    .order("reply_rate_leads_pct", { ascending: false });

  const rows =
    stats?.map((s: any) => ({
      template_id: s.template_id as string,
      template_name: s.template_name as string | null,
      template_subject: s.template_subject as string | null,
      total_sends: s.total_sends as number,
      total_leads_sent: s.total_leads_sent as number,
      total_replies: s.total_replies as number,
      total_leads_replied: s.total_leads_replied as number,
      reply_rate_leads_pct: Number(s.reply_rate_leads_pct ?? 0),
      intent_positive_count: s.intent_positive_count as number,
      intent_referral_count: s.intent_referral_count as number,
      intent_unsubscribe_count: s.intent_unsubscribe_count as number,
      intent_bounce_count: s.intent_bounce_count as number,
      intent_spam_count: s.intent_spam_count as number,
      first_send_at: s.first_send_at as string | null,
      last_send_at: s.last_send_at as string | null,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Template Performance
        </h1>
        <p className="text-sm text-muted-foreground">
          See which templates drive the highest reply rates and positive intent.
        </p>
      </div>

      <TemplatesPerformanceTable rows={rows} />
    </div>
  );
}































































