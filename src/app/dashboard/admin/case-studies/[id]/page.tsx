import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";
import { CaseStudyCopyButton } from "@/components/case-studies/CaseStudyCopyButton";
import { setCaseStudyApproval } from "../actions";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminCaseStudyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const sb = supabaseAdmin();
  const { data: cs, error } = await sb
    .from("case_studies")
    .select("id, company_id, title, generated_at, approved_for_use, snapshot_json, metrics_json")
    .eq("id", id)
    .single();

  if (error || !cs) notFound();

  const snapshot = cs.snapshot_json?.snapshot || {};
  const solution = asArray(cs.snapshot_json?.solution);
  const results = asArray(cs.snapshot_json?.results);
  const trigger = cs.metrics_json?.trigger || "—";

  const city = snapshot.city || "—";
  const state = snapshot.state || "";
  const location = [city, state].filter(Boolean).join(", ");
  const companySize = snapshot.company_size_range || "—";
  const timeDays = Number(snapshot.time_using_smartsend_days ?? 0);

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            <Link className="hover:underline" href="/dashboard/admin/case-studies">
              Case studies
            </Link>{" "}
            / {cs.id}
          </div>
          <h1 className="text-2xl font-semibold mt-1">{cs.title}</h1>
          <div className="text-sm text-slate-600 mt-2">
            Trigger: <span className="font-medium text-slate-900">{trigger}</span> • Generated:{" "}
            {cs.generated_at ? new Date(cs.generated_at).toLocaleString() : "—"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CaseStudyCopyButton caseStudy={cs as any} />
          <Link
            className="inline-flex items-center px-3 py-1.5 rounded border bg-white hover:bg-slate-50 text-sm"
            href={`/api/admin/case-studies/${cs.id}/pdf`}
            target="_blank"
          >
            Export as PDF
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-5">
        <div>
          <div className="text-sm font-semibold text-slate-900">Snapshot</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">City / State</div>
              <div className="font-medium text-slate-900 mt-0.5">{location || "—"}</div>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Company size (range)</div>
              <div className="font-medium text-slate-900 mt-0.5">{companySize}</div>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Time using SmartSend</div>
              <div className="font-medium text-slate-900 mt-0.5">
                {Number.isFinite(timeDays) && timeDays > 0 ? `${timeDays} days` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Problem</div>
          <div className="mt-2 rounded-lg border bg-white p-3 text-sm text-slate-900 leading-relaxed">
            {cs.snapshot_json?.problem || "—"}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Solution</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-900 space-y-1">
            {solution.length === 0 ? <li>—</li> : solution.map((s: any, idx: number) => <li key={idx}>{s?.label || "—"}</li>)}
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Results</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-900 space-y-1">
            {results.length === 0 ? (
              <li>—</li>
            ) : (
              results.map((r: any, idx: number) => (
                <li key={idx}>
                  <span className="font-medium">{r?.label || "Result"}:</span> {String(r?.value ?? "—")}
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Quote (system-generated)</div>
          <div className="mt-2 rounded-lg border bg-slate-50 p-3 text-sm text-slate-900">
            <div className="italic">“SmartSend paid for itself after the first job.”</div>
            <div className="text-xs text-slate-600 mt-1">(Anonymous, standardized.)</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Approval</div>
            <div className="text-xs text-slate-600 mt-1">Must be approved before any external use.</div>
          </div>

          <form action={setCaseStudyApproval} className="flex items-center gap-2">
            <input type="hidden" name="id" value={cs.id} />
            <input type="hidden" name="approved" value={String(!cs.approved_for_use)} />
            <button
              type="submit"
              className={[
                "inline-flex items-center px-3 py-1.5 rounded border text-sm",
                cs.approved_for_use
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50",
              ].join(" ")}
            >
              {cs.approved_for_use ? "Approved (click to unapprove)" : "Approve for use"}
            </button>
          </form>
        </div>
      </div>

      <details className="rounded-xl border bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Raw JSON (metrics + snapshot)</summary>
        <pre className="mt-3 text-xs overflow-auto bg-slate-50 border rounded p-3">
          {JSON.stringify({ snapshot_json: cs.snapshot_json, metrics_json: cs.metrics_json }, null, 2)}
        </pre>
      </details>
    </div>
  );
}









