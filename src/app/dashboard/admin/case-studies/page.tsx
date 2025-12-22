import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminCaseStudiesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("case_studies")
    .select("id, company_id, title, generated_at, approved_for_use, metrics_json")
    .order("generated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const rows = (data || []).map((cs: any) => {
    const trigger = cs?.metrics_json?.trigger || cs?.metrics_json?.["trigger"] || "—";
    return {
      id: cs.id,
      company_id: cs.company_id,
      title: cs.title,
      generated_at: cs.generated_at,
      approved_for_use: !!cs.approved_for_use,
      trigger,
    };
  });

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Case Studies (v1)</h1>
        <p className="text-sm text-slate-600 mt-1">
          Auto-generated from live wins. Read-only. Approval gate before any external use.
        </p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Trigger</th>
              <th className="px-4 py-2 text-left">Approved</th>
              <th className="px-4 py-2 text-left">Generated</th>
              <th className="px-4 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No case studies generated yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Company: {r.company_id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.trigger}</td>
                  <td className="px-4 py-3">
                    {r.approved_for_use ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                        approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-slate-50 text-slate-700 border-slate-200">
                        not approved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.generated_at ? new Date(r.generated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="inline-flex items-center px-3 py-1.5 rounded border bg-white hover:bg-slate-50"
                      href={`/dashboard/admin/case-studies/${r.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}









