import { createServiceClient } from "@/lib/supabase/server";
import { IntentOverview } from "./widgets/IntentOverview";
import { AuditSummary } from "./widgets/AuditSummary";
import { ConfusionTable } from "./widgets/ConfusionTable";
import { NeedsAudit } from "./widgets/NeedsAudit";
import { ExportPanel } from "./ExportPanel";

export const dynamic = "force-dynamic";

type IntentDistRow = { intent: string; cnt: number };
type AuditRow = { audited: number; accuracy: number | null; avg_confidence: number | null };
type ConfusionRow = { ai_intent: string; human_intent: string; cnt: number };
type NeedsAuditRow = {
  id: string;
  subject: string | null;
  ai_intent: string | null;
  ai_confidence: number | null;
  ai_classified_at: string | null;
  lead_id: string | null;
};

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
      <IntentOverview data={(dist as IntentDistRow[]) ?? []} />
      <AuditSummary audit={(audit as AuditRow) ?? { audited: 0, accuracy: null, avg_confidence: null }} />
      <ConfusionTable rows={(conf as ConfusionRow[]) ?? []} />
      <NeedsAudit rows={(needs as NeedsAuditRow[]) ?? []} />
      <ExportPanel />
    </div>
  );
}

