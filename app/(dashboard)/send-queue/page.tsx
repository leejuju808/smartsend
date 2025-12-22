import QueueTable from "@/components/send-queue/QueueTable";
import QueueFilters from "@/components/send-queue/Filters";
import Pagination from "@/components/ui/Pagination";
import { createClient } from "@/utils/supabase/server";
import { Suspense } from "react";
import SendsLeftCard from "../SendsLeftCard";

const PAGE_SIZE = 50;

function parseDateISO(d?: string | null) {
  if (!d) return null;
  try { return new Date(d).toISOString(); } catch { return null; }
}

export default async function SendQueuePage({
  searchParams
}: {
  searchParams: {
    page?: string;
    status?: string;
    from?: string;
    to?: string;
    campaign?: string;
  };
}) {
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const status = (searchParams.status || "").trim();
  const campaignId = (searchParams.campaign || "").trim();
  const fromISO = parseDateISO(searchParams.from || null);
  const toISO = parseDateISO(searchParams.to || null);

  const supabase = createClient();

  // Fetch campaigns for dropdown
  const { data: campaignsData } = await supabase
    .from("campaigns")
    .select("id, name")
    .order("name", { ascending: true });

  // Build base query with filters
  let query = supabase
    .from("send_queue")
    .select(`
      id, lead_id, campaign_id, status, attempt, max_attempts, scheduled_at, last_error,
      leads:lead_id ( email ),
      campaigns:campaign_id ( name )
    `, { count: "exact" })
    .order("scheduled_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (fromISO) query = query.gte("scheduled_at", fromISO);
  if (toISO) query = query.lte("scheduled_at", toISO);

  // Pagination via range
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query.range(from, to);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Send Queue</h1>
        <div className="rounded-xl border p-4 text-red-600">
          Error loading queue: {error.message}
        </div>
      </div>
    );
  }

  const rows = (data || []).map((r: any) => ({
    id: r.id,
    lead_email: r.leads?.email ?? "",
    campaign_name: r.campaigns?.name ?? "",
    status: r.status,
    attempt: r.attempt,
    max_attempts: r.max_attempts,
    scheduled_at: r.scheduled_at,
    last_error: r.last_error
  }));

  // helper to preserve filters in pagination links
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (campaignId) params.set("campaign", campaignId);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="p-0">
      <QueueFilters campaigns={(campaignsData || []) as any} />
      <div className="p-6 space-y-6">
        <SendsLeftCard />
        <div>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-semibold">Send Queue</h1>
            <div className="text-xs opacity-70">
              {count ?? 0} total • filtered
            </div>
          </div>

          <Suspense fallback={<div className="rounded-2xl border p-6">Loading…</div>}>
            {rows.length === 0 ? (
              <div className="rounded-2xl border p-10 text-center text-sm opacity-70">
                No rows match your filters.
              </div>
            ) : (
              <>
                <div className="sticky top-[64px] z-0"></div>
                <QueueTable rows={rows} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} buildHref={buildHref} />
              </>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}


