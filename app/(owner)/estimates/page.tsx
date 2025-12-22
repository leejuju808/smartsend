import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import CreateEstimateClient from "./_components/CreateEstimateClient";
import { OwnerDataExportButton } from "./_components/OwnerDataExportButton";

export const metadata = {
  title: "Estimates · SmartSend",
};

async function getCompanyId(userId: string, workspaceId: string) {
  const supabase = await getServerSupabase();

  // Prefer an explicit roofing company membership.
  const { data: membership } = await supabase
    .from("roofing_company_members")
    .select("roofing_company_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.roofing_company_id) return membership.roofing_company_id as string;

  // Fallback: first company attached to this workspace.
  const { data: company } = await supabase
    .from("roofing_companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (company?.id as string | undefined) ?? null;
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect("/welcome");

  const companyId = await getCompanyId(user.id, workspaceId);
  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Estimates</h1>
        <p className="text-sm text-slate-600 mt-2">
          No roofing company found for your account yet.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const openNew = sp?.new === "1";

  const { data: membership } = await supabase
    .from("roofing_company_members")
    .select("role, roofing_company_id")
    .eq("user_id", user.id)
    .eq("roofing_company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  const isOwner = membership?.role === "owner";

  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, customer_name, address, roof_type, size, scope, total_price, status, created_at, estimate_text")
    .eq("company_id", companyId)
    .not("estimate_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
          <p className="text-sm text-slate-600">
            One click → clean homeowner-ready estimate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner ? <OwnerDataExportButton /> : null}
          <CreateEstimateClient autoOpen={openNew} />
        </div>
      </header>

      <div className="border rounded-xl bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-medium">Recent estimates</div>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
            Back to dashboard
          </Link>
        </div>

        <div className="divide-y">
          {(estimates ?? []).length === 0 ? (
            <div className="p-4 text-sm text-slate-600">
              No estimates yet. Click <span className="font-medium">Create Estimate</span> to generate your first one.
            </div>
          ) : (
            (estimates ?? []).map((e: any) => (
              <details key={e.id} className="p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {e.customer_name || "Unnamed Customer"}{" "}
                        <span className="text-slate-500 font-normal">
                          • {e.scope || "Estimate"}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {e.address || "No address"} • {e.roof_type || "Roof"} • {e.size || ""}
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">
                        {typeof e.total_price === "number"
                          ? `$${e.total_price.toFixed(2)}`
                          : e.total_price
                          ? `$${Number(e.total_price).toFixed(2)}`
                          : ""}
                      </span>
                      <span className="text-slate-500"> • {e.status}</span>
                    </div>
                  </div>
                </summary>
                <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                  <pre className="whitespace-pre-wrap text-sm text-slate-900">
                    {e.estimate_text}
                  </pre>
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </div>
  );
}











