import { createClient } from "@supabase/supabase-js";

async function getData(campaignId: string) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [{ data: kpi }, { data: rows }] = await Promise.all([
    admin
      .from("v_campaign_kpis")
      .select("*")
      .eq("campaign_id", campaignId)
      .single(),
    admin
      .from("campaign_unsubscribes")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
  ]);

  return { kpi, rows: rows ?? [] };
}

export default async function UnsubsPage({ params }: { params: { id: string } }) {
  const { kpi, rows } = await getData(params.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Unsubscribes</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-muted-foreground">Unsubscribes</div>
          <div className="text-2xl font-semibold">{kpi?.unsubscribes ?? 0}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-muted-foreground">Unsub Rate</div>
          <div className="text-2xl font-semibold">{kpi?.unsub_rate_pct ?? 0}%</div>
        </div>
      </div>
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">When</th>
              <th className="p-2">Email</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.email}</td>
                <td className="p-2">{r.reason || "—"}</td>
                <td className="p-2">{r.details || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={4}>
                  No unsubscribes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

