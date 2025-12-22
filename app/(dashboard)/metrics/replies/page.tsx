import { createServiceClient } from "@/lib/supabase/server";
import { IntentOverview } from "./widgets/IntentOverview";
import { AuditSummary } from "./widgets/AuditSummary";
import { ConfusionTable } from "./widgets/ConfusionTable";
import { NeedsAudit } from "./widgets/NeedsAudit";

export default async function RepliesMetricsPage() {
  const supabase = createServiceClient();

  const [{ data: dist }, { data: audit }, { data: conf }, { data: needs }] = await Promise.all([
    supabase.from("v_intent_stats_30d").select("*"),
    supabase.from("v_intent_audit_30d").select("*").single(),
    supabase.from("v_intent_confusion_30d").select("*"),
    supabase.from("v_needs_audit").select("*"),
  ]);

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-bold">Reply Classifier — Metrics (30d)</h1>
      <IntentOverview data={dist ?? []} />
      <AuditSummary audit={audit ?? { audited: 0, accuracy: null, avg_confidence: null }} />
      <ConfusionTable rows={conf ?? []} />
      <NeedsAudit rows={needs ?? []} />
    </div>
  );
}





