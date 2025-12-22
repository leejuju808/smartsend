import { Suspense } from "react";
import QueueClient from "./queue-client";

export default function QueuePage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Send Queue</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <QueueClient />
      </Suspense>
    </div>
  );
}

import { QueueTable, type QueueRow } from "@/components/queue/QueueTable";
import { Suspense } from "react";

async function getQueue(): Promise<QueueRow[]> {
  // Replace with your data loader (RSC) from Supabase
  // Example shape only:
  return [];
}

export default async function QueuePage() {
  const data = await getQueue();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Send Queue</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <QueueTable data={data} onRefetch={() => window.location.reload()} />
      </Suspense>
    </div>
  );
}

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import QueueTable from "./QueueTable";

type Search = {
  status?: string;
  campaignId?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function QueuePage({ searchParams }: { searchParams: Search }) {
  const supabase = createServerComponentClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="p-6">Please sign in</div>;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const ws = profile?.workspace_id;
  if (!ws) return <div className="p-6">Workspace not found</div>;

  const status = searchParams.status ?? "";
  const campaignId = searchParams.campaignId ?? "";
  const fromIso = searchParams.from ? new Date(searchParams.from).toISOString() : null;
  const toIso = searchParams.to ? new Date(searchParams.to).toISOString() : null;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;
  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  let query = supabase
    .from("send_queue_view")
    .select("*", { count: "exact" })
    .eq("workspace_id", ws);

  if (status) query = query.eq("status", status);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (fromIso) query = query.gte("updated_at", fromIso);
  if (toIso) query = query.lte("updated_at", toIso);

  const { data: rows, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (error) return <div className="p-6 text-red-600">Error: {error.message}</div>;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id,name")
    .eq("workspace_id", ws)
    .order("name");

  return (
    <div className="p-6">
      <QueueTable
        rows={rows ?? []}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        campaigns={campaigns ?? []}
        initialFilters={{
          status,
          campaignId,
          from: searchParams.from ?? "",
          to: searchParams.to ?? "",
        }}
      />
    </div>
  );
}


