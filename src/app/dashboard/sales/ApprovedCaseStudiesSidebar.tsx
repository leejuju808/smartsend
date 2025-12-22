import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { CaseStudyCopyButton } from "@/components/case-studies/CaseStudyCopyButton";

export default async function ApprovedCaseStudiesSidebar() {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("case_studies")
    .select("id, title, generated_at, snapshot_json, metrics_json")
    .eq("approved_for_use", true)
    .order("generated_at", { ascending: false })
    .limit(6);

  if (error) {
    return (
      <aside className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold">Case Studies</div>
        <div className="text-xs text-slate-600 mt-1">Failed to load.</div>
      </aside>
    );
  }

  const items = data || [];
  if (items.length === 0) {
    return (
      <aside className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold">Case Studies</div>
        <div className="text-xs text-slate-600 mt-1">No approved case studies yet.</div>
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border bg-white p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">Case Studies</div>
        <div className="text-xs text-slate-600 mt-1">Approved proof you can copy into outreach.</div>
      </div>

      <div className="space-y-3">
        {items.map((cs: any) => (
          <div key={cs.id} className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">{cs.title}</div>
            <div className="text-xs text-slate-600 mt-1">
              {cs.generated_at ? new Date(cs.generated_at).toLocaleDateString() : "—"}
            </div>
            <div className="mt-2">
              <CaseStudyCopyButton caseStudy={cs} label="Copy proof" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}









